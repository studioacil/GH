#!/usr/bin/env bash
# Déploie GH/ sur GitHub (Pages auto). Usage : GH_TOKEN=ghp_xxx ./tools/deploy.sh
cd "$(dirname "$0")/.." && exec ruby tools/deploy.rb "$@"
