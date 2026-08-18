# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Static marketing site for MNK Solutions. `server.js` is a hand-rolled static file server that serves `htdocs/`.

## Hard rules

- Zero dependencies, on purpose. Do not add npm packages (including devDependencies) or replace `server.js` with Express or similar. Ask before changing this.
- The global `uncaughtException` handler in `server.js` is deliberate. A malformed-URL crash took the site down on 2026-08-04 (commit `1dd7619`). Do not remove or "clean up" that handler.
- The path-traversal guard and security headers in `server.js` are load-bearing (commit `e4653f0`). Any change to `server.js` needs a matching test in `test/server.test.js`.

## Commands

- Test: `npm test` (built-in `node --test` runner, no jest/mocha). Node >= 20 required.
- Run locally: `npm start`

## Deploy

Pushing to `main` deploys production. `.github/workflows/deploy-gandi.yml` force-pushes to Gandi PaaS and triggers the deploy over SSH. There is no staging environment, so treat every merge to `main` as a production release.
