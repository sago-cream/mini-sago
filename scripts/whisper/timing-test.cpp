#include "minisago-timing.h"
#include <cassert>
#include <thread>
void other_translation_unit();
int main() {
 minisago_timing::reset();
 { minisago_timing::Scope outer("parent"); other_translation_unit(); }
 auto & s = minisago_timing::state();
 assert(s.spans.size()==2 && s.spans[1].depth==1);
 assert(s.spans[0].duration_ms >= s.spans[1].duration_ms);
 std::thread t([] { minisago_timing::reset(); {minisago_timing::Scope child("other request");} assert(minisago_timing::state().spans.size()==1); }); t.join();
 assert(s.spans.size()==2);
 minisago_timing::reset(); assert(s.spans.empty());
}
