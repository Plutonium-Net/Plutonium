# Plutonium

Plutonium is a web platform for games, web browsing, cloud gaming, and other stuff.

It started as a place to play browser games, but has grown into more of a general-purpose web platform.

## Features

* Game library
* Import your own HTML games
* Game favorites and play history
* Pluto Proxy
* Ultraviolet and Scramjet support
* Hyperbeam
* Cloud gaming
* User accounts
* Cloud storage
* AI
* Settings and customization
* More stuff that's still being worked on

## Games

Plutonium has its own game library, while also allowing users to add their own games.

You can import an HTML game directly or import one from GitHub.

Games are kept separate from the rest of the site, so they can be added or removed without changing the main application.

## Proxy

Pluto Proxy lets you browse the web through Plutonium.

It supports multiple proxy backends, including:

* Ultraviolet
* Scramjet
* Hyperbeam

## Cloud Gaming

Plutonium also has cloud gaming support.

The cloud gaming backend handles things like sessions, queues, WebRTC signaling, and connecting users to game instances.

## Cloud Storage

Plutonium has its own storage system for user data.

The frontend communicates with a Cloudflare Worker, which handles the Firebase requests instead of exposing the Firebase configuration directly to the client.

## Repository

```text
Plutonium/
├── cf-worker/
├── css/
├── data/
├── img/
├── js/
├── sj/
├── uv/
├── account.html
├── cloud.html
├── games.html
├── index.html
├── settings.html
└── web.html
```

## Running locally

Clone the repository and serve it with a web server:

```bash
git clone https://github.com/Plutonium-Net/Plutonium.git
cd Plutonium
```

Then open the site through your local server.

Some features require the corresponding Plutonium backend services to be configured, so not everything will work from a basic local server.

## Related projects

* [PlutoPack](https://github.com/Plutonium-Net/plutopack) — package format for distributing web games and applications
* [Plutonium-GCDN](https://github.com/Plutonium-Net/Plutonium-GCDN) — game CDN

## Status

Plutonium is still being developed. Some features are finished, while others are experimental or not available yet.

## License

See the repository for licensing information.
