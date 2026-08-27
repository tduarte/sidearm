# CS2 dedicated server + Metamod, CounterStrikeSharp and MatchZy.
#
# Why an image at all, when the plugins have to end up in a volume: the image is
# where the *pinned artifacts* live, so a plugin version is a one-line diff with
# a history rather than something someone once did on a server by hand. The
# install itself happens at boot — see install-plugins.sh for why it cannot
# happen in a layer.
#
# Build: docker compose build cs2   (recreates the container: drops players)

ARG CS2_IMAGE=joedwards32/cs2:latest
FROM ${CS2_IMAGE}

# Pinned deliberately. "latest" is how you find out at 9pm that a plugin update
# renamed a convar. Bump these in a commit, with the CS2 build you tested on.
#
#   Metamod          https://mms.alliedmods.net/mmsdrop/2.0/
#   CounterStrikeSharp  MatchZy 0.8.15 builds against API 1.0.342, so >= that
#   MatchZy          https://github.com/shobhit-pathak/MatchZy/releases
ARG METAMOD_VERSION=2.0.0-git1410
ARG CSSHARP_VERSION=1.0.373
ARG MATCHZY_VERSION=0.8.15

USER root

# All three archives share the same `addons/` (+ `cfg/`) shape, so they stack
# into one tree that install-plugins.sh copies wholesale.
#
# `counterstrikesharp-with-runtime` is the right artifact: the base image has no
# .NET runtime, and the plain build assumes one is present.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl unzip ca-certificates; \
    mkdir -p /opt/sidearm/plugins; \
    cd /tmp; \
    curl -fsSL -o metamod.tar.gz \
      "https://mms.alliedmods.net/mmsdrop/2.0/mmsource-${METAMOD_VERSION}-linux.tar.gz"; \
    tar -xzf metamod.tar.gz -C /opt/sidearm/plugins; \
    curl -fsSL -o cssharp.zip \
      "https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v${CSSHARP_VERSION}/counterstrikesharp-with-runtime-linux-${CSSHARP_VERSION}.zip"; \
    unzip -q cssharp.zip -d /opt/sidearm/plugins; \
    curl -fsSL -o matchzy.zip \
      "https://github.com/shobhit-pathak/MatchZy/releases/download/${MATCHZY_VERSION}/MatchZy-${MATCHZY_VERSION}.zip"; \
    unzip -q matchzy.zip -d /opt/sidearm/plugins; \
    printf 'metamod=%s cssharp=%s matchzy=%s\n' \
      "${METAMOD_VERSION}" "${CSSHARP_VERSION}" "${MATCHZY_VERSION}" \
      > /opt/sidearm/plugins/.version; \
    rm -f /tmp/metamod.tar.gz /tmp/cssharp.zip /tmp/matchzy.zip; \
    apt-get purge -y unzip; \
    apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/*

# Kept so the entrypoint can tell "the stock no-op hook" from "a hook someone
# actually wrote", and only overwrite the former.
RUN cp /etc/pre.sh /opt/sidearm/pre.sh.stock

COPY install-plugins.sh /opt/sidearm/install-plugins.sh
COPY entrypoint.sh      /opt/sidearm/entrypoint.sh

# Ownership set per-path, never `chown -R`: on this project's ZFS-backed LXC an
# ownership change forces an overlayfs copy-up, and recursing a large tree
# measured 607s (see the panel Dockerfile).
RUN chmod +x /opt/sidearm/install-plugins.sh /opt/sidearm/entrypoint.sh

USER 1000:1000

# Setting ENTRYPOINT resets the inherited CMD, so it is restated verbatim.
ENTRYPOINT ["/opt/sidearm/entrypoint.sh"]
CMD ["bash", "entry.sh"]
