/**
 * Pinned on-device engines and models.
 * The website installer stays small. These download into the app data folder.
 */

const LLAMA = 'b11840';
const WHISPER = 'b5454';

function llama(name) {
    return `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA}/${name}`;
}

function whisper(name) {
    return `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER}/${name}`;
}

const PACKS = {
    'linux-x64': {
        id: 'linux-x64',
        llama: llama('llama-b11840-bin-ubuntu-x64.tar.gz'),
        whisper: whisper('whisper-bin-ubuntu-x64.tar.gz'),
    },
    'linux-arm64': {
        id: 'linux-arm64',
        llama: llama('llama-b11840-bin-ubuntu-arm64.tar.gz'),
        whisper: whisper('whisper-bin-ubuntu-arm64.tar.gz'),
    },
    'darwin-arm64': {
        id: 'darwin-arm64',
        llama: llama('llama-b11840-bin-macos-arm64.tar.gz'),
        whisper: null,
    },
    'darwin-x64': {
        id: 'darwin-x64',
        llama: llama('llama-b11840-bin-macos-x64.tar.gz'),
        whisper: null,
    },
    'win32-x64': {
        id: 'win32-x64',
        llama: llama('llama-b11840-bin-win-cpu-x64.zip'),
        whisper: whisper('whisper-bin-x64.zip'),
    },
};

const MODELS = {
    notes: {
        file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
        url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
        minBytes: 900_000_000,
    },
    speech: {
        file: 'ggml-small.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
        minBytes: 400_000_000,
    },
};

function packFor(platform, arch) {
    return PACKS[`${platform}-${arch}`] || null;
}

module.exports = { LLAMA, WHISPER, PACKS, MODELS, packFor };
