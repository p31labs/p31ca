FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        just jq curl git build-essential cmake ninja-build python3-venv \
        usbip

RUN curl -fsSL https://raw.githubusercontent.com/platformio/platformio/master/scripts/get-platformio.py -o get-platformio.py \
    && python3 get-platformio.py \
    && ln -s ~/.platformio/penv/bin/platformio /usr/local/bin/platformio \
    && ln -s ~/.platformio/penv/bin/piodebuggdb /usr/local/bin/piodebuggdb

RUN apt-get autoremove -y && apt-get clean -y && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.platformio/penv/bin:$PATH"
