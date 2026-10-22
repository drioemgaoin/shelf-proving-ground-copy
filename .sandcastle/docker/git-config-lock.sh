#!/bin/sh
# Wrapper: serialize `git config --global` writes with flock.
#
# The @ai-hero/sandcastle package runs `git config --global --add safe.directory`
# during every sandbox.run() setup.  When two agents run in parallel in the
# same container, concurrent writes race on ~/.gitconfig.lock (git uses O_EXCL
# with no retry).  flock serializes these writes so the second caller blocks
# until the first finishes instead of failing.
#
# Only `git config` commands that include `--global` are serialized.
# All other git commands exec directly with zero overhead.

case "$1" in
  config)
    for arg in "$@"; do
      if [ "$arg" = "--global" ]; then
        exec flock /tmp/git-global-config.lock /usr/bin/git "$@"
      fi
    done
    ;;
esac
exec /usr/bin/git "$@"
