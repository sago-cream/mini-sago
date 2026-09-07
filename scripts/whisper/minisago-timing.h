#pragma once
#include <chrono>
#include <vector>
namespace minisago_timing {
using Clock = std::chrono::steady_clock;
struct Span { const char * name; double start_ms; double duration_ms; int depth; };
struct State { Clock::time_point origin; std::vector<Span> spans; int depth = 0; bool enabled = false; };
inline State & state() { static thread_local State value; return value; }
inline double now() { return std::chrono::duration<double, std::milli>(Clock::now() - state().origin).count(); }
inline void reset() { auto & s = state(); s.origin = Clock::now(); s.spans.clear(); s.depth = 0; s.enabled = true; }
struct Scope {
    int index = -1;
    Scope(const char * name) { auto & s = state(); if (!s.enabled) return; if (s.spans.size() < 8192) { index = (int)s.spans.size(); s.spans.push_back({name, now(), -1, s.depth}); } ++s.depth; }
    ~Scope() { auto & s = state(); if (!s.enabled) return; --s.depth; if (index >= 0) s.spans[index].duration_ms = now() - s.spans[index].start_ms; }
};
}
