# Whisper request timings

`instrument.py` patches the pinned whisper.cpp 1.9.1 source during the Docker build. Anchor assertions deliberately fail if upstream code changes.

The verbose JSON response adds `timings.totalMs` and nested wall-clock spans. The clock starts when the inference handler begins, before waiting for the model mutex. It excludes request upload/multipart parsing before the handler and final response serialization. The client separately measures audio conversion, the complete HTTP request, and JSON parsing.

VAD includes lazy initialization. Encoder and decoder spans can occur inside both transcription and the extra language diagnostics pass; nested durations are not additive. Thread-local storage isolates simultaneous HTTP requests. Internal spans assume the deployed default of one Whisper processor (`--processors 1`); compute threads remain inside their calling span. Capture is capped at 8,192 spans per request.

Run the cross-translation-unit and concurrent-request isolation test:

```sh
c++ -std=c++11 -pthread -I scripts/whisper scripts/whisper/timing-test.cpp scripts/whisper/timing-test-other.cpp -o /tmp/minisago-timing-test
/tmp/minisago-timing-test
```

Old saved recordings remain readable; runs without timing data must be rerun to show stage timings.

Silero VAD uses one CPU thread for its small 32 ms chunks. The upstream default is four threads, independently of the server’s `--threads` setting; this oversubscribes our two-core Oracle instance. Whisper transcription still uses the configured two threads. Fixed-language requests skip the extra language-probability diagnostics pass; auto-language requests retain it.
