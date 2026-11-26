#!/usr/bin/env python3

import argparse
import http.server
import socketserver
from pathlib import Path


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview the generated static H5 package.")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    handler = lambda *values, **kwargs: http.server.SimpleHTTPRequestHandler(  # noqa: E731
        *values, directory=str(root), **kwargs
    )
    with ReusableTCPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Serving {root} at http://127.0.0.1:{args.port}")
        server.serve_forever()


if __name__ == "__main__":
    main()
