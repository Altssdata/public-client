import ssl
import unittest
from dataclasses import FrozenInstanceError
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

from altss_public import AltssHttpError, AltssPublicClient, resources


class Response:
    def __init__(self, body=b'{"ok":true}', status=200, headers=None):
        self.status = status
        self.headers = {"content-type": "application/json", **(headers or {})}
        self.body = body
        self.offset = 0
        self.closed = False
        self.on_read = lambda: None
        self.reads = 0

    def getheader(self, name):
        return self.headers.get(name.lower())

    def read1(self, count):
        self.on_read()
        self.reads += 1
        result = self.body[self.offset : self.offset + count]
        self.offset += len(result)
        return result

    def close(self):
        self.closed = True


class Connection:
    def __init__(self, response):
        self.response = response
        self.sock = Mock()
        self.requests = []
        self.closed = False

    def connect(self):
        pass

    def request(self, method, path, *, headers):
        self.requests.append((method, path, headers))

    def getresponse(self):
        return self.response

    def close(self):
        self.closed = True


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.response = Response()
        self.connection = Connection(self.response)
        self.patch = patch("http.client.HTTPSConnection", return_value=self.connection)
        self.factory = self.patch.start()
        self.addCleanup(self.patch.stop)
        self.client = AltssPublicClient()

    def test_fixed_https_origin_get_only_and_no_ambient_credentials(self):
        result = self.client.get_catalog("data")
        self.assertEqual(self.factory.call_args.args, ("altss.com",))
        context = self.factory.call_args.kwargs["context"]
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        method, path, headers = self.connection.requests[0]
        self.assertEqual((method, path), ("GET", "/api/v1/data-catalog.json"))
        self.assertEqual(set(headers), {"Accept", "Accept-Encoding", "User-Agent"})
        self.assertEqual(headers["Accept-Encoding"], "identity")
        self.assertEqual(result.url, "https://altss.com/api/v1/data-catalog.json")
        self.assertEqual(result.data, {"ok": True})
        self.assertTrue(self.response.closed and self.connection.closed)

    def test_invalid_constructor_options(self):
        for value in (True, False, 0, -1, 61, float("inf"), float("nan"), "10", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                AltssPublicClient(timeout=value)
        for value in (1, "true", None):
            with self.subTest(sandbox=value), self.assertRaises(TypeError):
                AltssPublicClient(sandbox=value)
        self.factory.assert_not_called()

    def test_public_resource_names_cannot_escape_origin(self):
        for name in (
            "https://evil.example/",
            "document:../../private",
            "catalog:data?x=y",
            "__proto__",
            [],
            None,
        ):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.client.read(name)
        self.factory.assert_not_called()

    def test_profile_slug_path_injection_is_rejected_before_network(self):
        for slug in (
            "../secret",
            "x?y=z",
            "x/y",
            "X",
            "x\n",
            "x%2fy",
            "",
            "a" * 201,
            None,
            1,
        ):
            with self.subTest(slug=slug), self.assertRaises(ValueError):
                self.client.get_profile(slug)
        self.factory.assert_not_called()

    def test_invalid_search_queries_are_rejected_before_network(self):
        for query in ("x", "  ", "!!!", "a" * 121, None, []):
            with self.subTest(query=query), self.assertRaises(ValueError):
                self.client.search_profiles(query)
        self.factory.assert_not_called()

    def test_limit_is_bounded_and_does_not_accept_booleans(self):
        for limit in (True, False, 0, 6, 1.5, "2", None):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                self.client.search_profiles("Example", limit=limit)
        self.factory.assert_not_called()

    def test_cursor_validation_is_local(self):
        for cursor in ("", "x&limit=99", "x\n", "x" * 257, [], 1):
            with self.subTest(cursor=cursor), self.assertRaises(ValueError):
                self.client.search_profiles("Example", cursor=cursor)
        self.factory.assert_not_called()

    def test_search_encodes_query_and_preserves_bounded_pagination(self):
        self.client.search_profiles("  Example & Co  ", limit=2, cursor="abc_-9")
        path = self.connection.requests[0][1]
        self.assertEqual(urlsplit(path).path, "/api/v1/public/profiles")
        self.assertEqual(
            parse_qs(urlsplit(path).query),
            {"query": ["Example & Co"], "limit": ["2"], "cursor": ["abc_-9"]},
        )

    def test_sandbox_affects_profiles_not_catalogs(self):
        second_connection = Connection(Response())
        self.factory.side_effect = [self.connection, second_connection]
        sandbox = AltssPublicClient(sandbox=True)
        sandbox.get_profile("example-capital-01")
        sandbox.get_catalog("data")
        self.assertEqual(
            [r[1] for c in (self.connection, second_connection) for r in c.requests],
            [
                "/api/v1/sandbox/public/profiles/example-capital-01",
                "/api/v1/data-catalog.json",
            ],
        )

    def test_markdown_is_not_parsed_as_json(self):
        self.response.headers["content-type"] = "text/markdown; charset=utf-8"
        self.response.body = b"# Public reference\n"
        result = self.client.get_document("developers")
        self.assertEqual(result.data, "# Public reference\n")
        self.assertEqual(self.connection.requests[0][2]["Accept"], "text/markdown")

    def test_schema_json_media_type(self):
        self.response.headers["content-type"] = "application/schema+json"
        self.assertEqual(self.client.get_schema("company").status, 200)

    def test_conditional_response_never_creates_a_hidden_cache(self):
        self.response.status = 304
        self.response.headers["etag"] = 'W/"abc"'
        result = self.client.get_catalog("data", etag='W/"abc"')
        self.assertEqual(result.status, 304)
        self.assertIsNone(result.data)
        self.assertEqual(result.etag, 'W/"abc"')
        self.assertEqual(self.response.reads, 0)
        self.assertEqual(self.connection.requests[0][2]["If-None-Match"], 'W/"abc"')

    def test_unsolicited_304_is_an_error(self):
        self.response.status = 304
        with self.assertRaises(AltssHttpError):
            self.client.get_catalog("data")

    def test_invalid_etags_cannot_inject_headers(self):
        for etag in ("abc", '"x"\r\nAuthorization: secret', "*", "", 1):
            with self.subTest(etag=etag), self.assertRaises(ValueError):
                self.client.get_catalog("data", etag=etag)
        self.factory.assert_not_called()

    def test_redirects_are_not_followed(self):
        for status in (301, 302, 303, 307, 308):
            self.response.status = status
            self.response.headers["location"] = "https://app.altss.com/private"
            with (
                self.subTest(status=status),
                self.assertRaises(AltssHttpError) as error,
            ):
                self.client.get_catalog("data")
            self.assertEqual(error.exception.status, status)
        self.assertEqual(len(self.connection.requests), 5)
        self.assertEqual(self.response.reads, 0)

    def test_http_failures_do_not_read_or_retain_response_body_or_retry(self):
        self.response.status = 429
        self.response.headers["retry-after"] = "30"
        self.response.body = b"untrusted provider or private error details"
        with self.assertRaises(AltssHttpError) as error:
            self.client.get_profile("example")
        self.assertEqual(error.exception.retry_after, "30")
        self.assertNotIn("untrusted", str(error.exception))
        self.assertEqual(self.response.reads, 0)
        self.assertEqual(len(self.connection.requests), 1)
        self.assertTrue(self.response.closed and self.connection.closed)

    def test_html_auth_wall_is_not_a_successful_json_response(self):
        self.response.headers["content-type"] = "text/html"
        with self.assertRaisesRegex(ValueError, "content type"):
            self.client.get_catalog("data")
        self.assertEqual(self.response.reads, 0)

    def test_unrequested_compression_is_rejected(self):
        self.response.headers["content-encoding"] = "gzip"
        with self.assertRaisesRegex(ValueError, "encoding"):
            self.client.get_catalog("data")

    def test_declared_oversized_or_invalid_body_is_rejected_before_read(self):
        for length in (str(4 * 1024 * 1024 + 1), "-1", "unknown", " 42", "\u0661"):
            self.response.headers["content-length"] = length
            with (
                self.subTest(length=length),
                self.assertRaisesRegex(ValueError, "Content-Length"),
            ):
                self.client.get_catalog("data")
        self.assertEqual(self.response.reads, 0)

    def test_undeclared_oversized_body_is_stopped_at_limit(self):
        self.response.body = b"x" * (4 * 1024 * 1024 + 100000)
        with self.assertRaisesRegex(ValueError, "4 MiB"):
            self.client.get_catalog("data")
        self.assertEqual(self.response.offset, 4 * 1024 * 1024 + 1)
        self.assertTrue(self.response.closed and self.connection.closed)

    def test_incomplete_content_length_is_not_accepted(self):
        self.response.headers["content-length"] = "100"
        with self.assertRaisesRegex(ValueError, "incomplete"):
            self.client.get_catalog("data")

    def test_exact_length_connection_close_needs_no_further_socket_access(self):
        self.response.headers["content-length"] = str(len(self.response.body))
        closed = [False]

        def check_socket(_):
            if closed[0]:
                raise OSError("socket closed by HTTPResponse")

        self.connection.sock.settimeout.side_effect = check_socket
        self.response.on_read = lambda: closed.__setitem__(0, True)
        self.assertEqual(self.client.get_catalog("data").status, 200)
        self.assertEqual(self.response.reads, 1)

    def test_invalid_utf8_is_an_error(self):
        self.response.body = b'{"name":"\xff"}'
        with self.assertRaises(UnicodeDecodeError):
            self.client.get_catalog("data")

    def test_invalid_non_object_and_nonstandard_json_fail(self):
        for body in (
            b"{",
            b"null",
            b"[]",
            b'"text"',
            b'{"value": NaN}',
            b'{"value": Infinity}',
        ):
            self.response.offset = 0
            self.response.body = body
            with self.subTest(body=body), self.assertRaises(ValueError):
                self.client.get_catalog("data")

    def test_request_and_body_share_one_deadline(self):
        clock = [100.0]
        self.response.body = b"{}"
        self.response.on_read = lambda: clock.__setitem__(0, 111.0)
        with (
            patch("time.monotonic", side_effect=lambda: clock[0]),
            self.assertRaisesRegex(TimeoutError, "deadline"),
        ):
            self.client.get_catalog("data")
        self.assertEqual(self.response.reads, 1)
        self.assertTrue(self.response.closed and self.connection.closed)

    def test_socket_timeout_is_honest_and_not_retried(self):
        self.connection.getresponse = Mock(side_effect=TimeoutError())
        with self.assertRaises(TimeoutError):
            self.client.get_profile("example")
        self.assertEqual(len(self.connection.requests), 1)
        self.assertTrue(self.connection.closed)

    def test_tls_failure_closes_connection(self):
        self.connection.connect = Mock(side_effect=ssl.SSLCertVerificationError("test"))
        with self.assertRaises(ssl.SSLCertVerificationError):
            self.client.get_catalog("data")
        self.assertTrue(self.connection.closed)

    def test_metadata_preserves_serving_instance_semantics(self):
        self.response.headers.update(
            {
                "altss-environment": "sandbox",
                "ratelimit-limit": "60",
                "ratelimit-remaining": "5",
                "ratelimit-reset": "20",
                "cache-control": "private, no-store",
            }
        )
        result = self.client.get_profile("example")
        self.assertEqual(result.environment, "sandbox")
        self.assertEqual(
            result.rate_limit, {"limit": "60", "remaining": "5", "reset_seconds": "20"}
        )
        self.assertEqual(result.cache_control, "private, no-store")
        with self.assertRaises(FrozenInstanceError):
            result.status = 500

    def test_resource_inventory_is_immutable(self):
        with self.assertRaises(TypeError):
            resources["private"] = "/private"


if __name__ == "__main__":
    unittest.main()
