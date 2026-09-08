"""Instrument pinned whisper.cpp 1.9.1; fail closed when patch anchors change."""
from pathlib import Path
import re

def replace_once(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new)

p = Path('src/whisper.cpp')
s = '#include "minisago-timing.h"\n' + p.read_text()
for function, label in [('whisper_vad', 'VAD'), ('whisper_pcm_to_mel_with_state', 'Mel spectrogram'), ('whisper_lang_auto_detect_with_state', 'Language detection'), ('whisper_encode_internal', 'Encoder'), ('whisper_decode_internal', 'Decoder')]:
    pattern = r'((?:static bool|int) ' + function + r'\([^{}]*\)\s*\{)'
    s, count = re.subn(pattern, lambda m: m[1] + '\n    minisago_timing::Scope timing_scope("' + label + '");', s)
    assert count == 1, (function, count)
# Silero processes tiny 32 ms chunks. Four worker threads oversubscribe our two-core host.
s = replace_once(s, 'struct whisper_vad_context_params vad_ctx_params = whisper_vad_default_context_params();',
    'struct whisper_vad_context_params vad_ctx_params = whisper_vad_default_context_params();\n        vad_ctx_params.n_threads = 1;')
p.write_text(s)
p = Path('examples/server/server.cpp')
s = '#include "minisago-timing.h"\n' + p.read_text()
s = replace_once(s, '// acquire whisper model mutex lock\n        std::lock_guard<std::mutex> lock(whisper_mutex);', '''minisago_timing::reset();
        std::unique_lock<std::mutex> lock(whisper_mutex, std::defer_lock);
        { minisago_timing::Scope wait("Model queue wait"); lock.lock(); }
        minisago_timing::Scope request_scope("Server processing");''')
s = replace_once(s, 'if (whisper_full_parallel(ctx, wparams, pcmf32.data(), pcmf32.size(), params.n_processors) != 0) {', '''int inference_status;
            { minisago_timing::Scope inference("Inference");
              inference_status = whisper_full_parallel(ctx, wparams, pcmf32.data(), pcmf32.size(), params.n_processors); }
            if (inference_status != 0) {''')
s = replace_once(s, 'if (!params.no_language_probabilities) {', 'if (!params.no_language_probabilities) {\n                minisago_timing::Scope diagnostics("Language diagnostics (extra pass)");')
anchor = "res.set_content(jres.dump(-1, ' ', false, json::error_handler_t::replace),"
pos = s.index(anchor)
s = s[:pos] + '''const double timing_total = minisago_timing::now();
            jres["timings"] = {{"totalMs", timing_total}, {"spans", json::array()}};
            for (const auto & span : minisago_timing::state().spans) {
                jres["timings"]["spans"].push_back({{"name", span.name}, {"startMs", span.start_ms},
                    {"durationMs", span.duration_ms < 0 ? timing_total - span.start_ms : span.duration_ms}, {"depth", span.depth}});
            }
            ''' + s[pos:]
p.write_text(s)
