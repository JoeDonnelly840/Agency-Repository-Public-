"""A deliberately slow, polite HTTP client.

Safety rules enforced here, for every request the collector makes:
  * only hosts in config.ALLOWED_HOSTS can be contacted (anything else raises);
  * only GET requests - the collector never submits, posts or changes anything;
  * one request at a time, with a minimum pause between requests to each host;
  * a hard cap on total requests per run;
  * robots.txt is checked for ordinary web pages (the SEC feeds);
  * 429/503 "slow down" answers are obeyed (Retry-After), and a source that keeps
    failing is switched off for the rest of the run (circuit breaker);
  * the client identifies itself honestly with a User-Agent string.
"""
import gzip
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

from . import config


class RequestRefused(Exception):
    """Raised when a request would break one of the safety rules."""


class SourceUnavailable(Exception):
    """Raised when a source failed; the message says why."""


class PoliteClient:
    def __init__(self, user_agent=config.USER_AGENT, sleep=time.sleep, clock=time.monotonic,
                 opener=None):
        self.user_agent = user_agent
        self._sleep = sleep
        self._clock = clock
        self._open = opener or urllib.request.urlopen
        self._last_request_at = {}
        self._robots = {}
        self.total_requests = 0
        self.failures_by_source = {}

    # -- guards ------------------------------------------------------------
    def _check_allowed(self, url):
        parts = urllib.parse.urlsplit(url)
        if parts.scheme != "https":
            raise RequestRefused(f"Refused non-HTTPS URL: {url}")
        if parts.hostname not in config.ALLOWED_HOSTS:
            raise RequestRefused(f"Refused host not on the allow-list: {parts.hostname}")
        if self.total_requests >= config.MAX_REQUESTS_PER_RUN:
            raise RequestRefused("Per-run request ceiling reached; stopping to stay polite.")
        return parts.hostname

    def _wait_turn(self, host):
        gap = config.MIN_SECONDS_BETWEEN_REQUESTS.get(host, 5.0)
        last = self._last_request_at.get(host)
        if last is not None:
            remaining = gap - (self._clock() - last)
            if remaining > 0:
                self._sleep(remaining)

    def _robots_allows(self, url, host):
        if host not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            robots_url = f"https://{host}/robots.txt"
            try:
                body = self._raw_get(robots_url, host)
                rp.parse(body.decode("utf-8", "replace").splitlines())
            except Exception as exc:  # cannot read robots.txt -> be conservative
                raise SourceUnavailable(f"Could not read {robots_url} ({exc}); skipped to be safe.")
            self._robots[host] = rp
        return self._robots[host].can_fetch(self.user_agent, url)

    # -- requests ----------------------------------------------------------
    def _raw_get(self, url, host, headers=None):
        self._wait_turn(host)
        req = urllib.request.Request(url, method="GET", headers={
            "User-Agent": self.user_agent,
            "Accept-Encoding": "gzip",
            **(headers or {}),
        })
        self.total_requests += 1
        self._last_request_at[host] = self._clock()
        with self._open(req, timeout=config.REQUEST_TIMEOUT_SECONDS) as resp:
            body = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip":
                body = gzip.decompress(body)
            return body

    def get(self, url, source, headers=None, check_robots=False):
        """GET a URL, politely. Returns bytes or raises SourceUnavailable."""
        if self.failures_by_source.get(source, 0) >= config.MAX_CONSECUTIVE_FAILURES_PER_SOURCE:
            raise SourceUnavailable("Stopped after repeated failures (circuit breaker).")
        host = self._check_allowed(url)
        if check_robots and not self._robots_allows(url, host):
            raise SourceUnavailable(f"robots.txt on {host} does not allow this page; skipped.")

        last_error = None
        for attempt in range(config.MAX_RETRIES + 1):
            try:
                body = self._raw_get(url, host, headers)
                self.failures_by_source[source] = 0
                return body
            except urllib.error.HTTPError as exc:
                last_error = f"HTTP {exc.code}"
                if exc.code in (429, 500, 502, 503, 504) and attempt < config.MAX_RETRIES:
                    wait = _retry_after(exc, default=30 * (attempt + 1))
                    self._sleep(wait)
                    continue
                break  # 4xx errors are not retried
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_error = f"network error: {getattr(exc, 'reason', exc)}"
                if attempt < config.MAX_RETRIES:
                    self._sleep(30 * (attempt + 1))
                    continue
                break
        self.failures_by_source[source] = self.failures_by_source.get(source, 0) + 1
        raise SourceUnavailable(last_error or "unknown error")

    def get_json(self, url, source, headers=None):
        body = self.get(url, source, headers=headers)
        try:
            return json.loads(body.decode("utf-8"))
        except ValueError as exc:
            raise SourceUnavailable(f"Response was not valid JSON ({exc})")


def _retry_after(exc, default):
    try:
        value = int(exc.headers.get("Retry-After", default))
    except (TypeError, ValueError):
        value = default
    return max(1, min(value, config.MAX_RETRY_AFTER_SECONDS))
