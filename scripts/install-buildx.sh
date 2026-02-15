#!/bin/bash
set -e

ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
esac

mkdir -p ~/.docker/cli-plugins

echo "Downloading docker-buildx for linux-$ARCH..."
BUILDX_VERSION=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")
curl -SL "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-${ARCH}" -o ~/.docker/cli-plugins/docker-buildx
chmod +x ~/.docker/cli-plugins/docker-buildx

echo "Installed:"
docker buildx version
