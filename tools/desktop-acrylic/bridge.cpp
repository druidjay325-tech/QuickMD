// Microsoft DesktopAcrylicController bridge; every call belongs to the Tauri UI thread.
#include <windows.h>
#include <dwmapi.h>
#include <DispatcherQueue.h>
#include <windows.ui.composition.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.UI.Composition.h>
#include <winrt/Windows.UI.Composition.Desktop.h>
#include <winrt/Microsoft.UI.Composition.SystemBackdrops.h>
#include <MddBootstrap.h>
#include <memory>
#include <string>
#include <sstream>
#include <locale>
#include <cstring>
#include <cmath>
using namespace winrt;
using namespace Windows::UI::Composition;
using namespace Microsoft::UI::Composition::SystemBackdrops;
static DWORD ui_thread = 0;
static bool bootstrapped = false, apartment_initialized = false;
static Windows::System::DispatcherQueueController queue{nullptr};
static std::string last_error;
struct Context {
    HWND hwnd{};
    Compositor compositor{nullptr};
    Windows::UI::Composition::Desktop::DesktopWindowTarget target{nullptr};
    ContainerVisual root{nullptr};
    DesktopAcrylicController controller{nullptr};
    SystemBackdropConfiguration config{nullptr};
    ~Context() noexcept {
        try { if(controller) controller.Close(); if(target) {target.Root(nullptr); target.Close();} if(compositor) compositor.Close(); } catch(...) {}
        if(IsWindow(hwnd)) {BOOL disabled=FALSE; DwmSetWindowAttribute(hwnd,17,&disabled,sizeof(disabled));}
    }
};
static void ensure_ui() {
    if(ui_thread && ui_thread!=GetCurrentThreadId()) throw hresult_wrong_thread();
    ui_thread=GetCurrentThreadId();
}
static int fail(hresult_error const& error) {last_error=to_string(error.message());return error.code();}
extern "C" __declspec(dllexport) int __stdcall QMCreate(HWND hwnd, void** output) {
    try {
        ensure_ui(); if(!output || !IsWindow(hwnd)) return E_INVALIDARG; *output=nullptr;
        if(!bootstrapped) {
            PACKAGE_VERSION minimum{}; minimum.Version=0x0002000500010000ULL;
            check_hresult(MddBootstrapInitialize2(0x00020005,L"",minimum,MddBootstrapInitializeOptions_None));
            bootstrapped=true;
        }
        if(!apartment_initialized) {init_apartment(apartment_type::single_threaded);apartment_initialized=true;}
        if(!DesktopAcrylicController::IsSupported()) {last_error="DesktopAcrylicController is not supported on this system";return E_NOTIMPL;}
        if(!Windows::System::DispatcherQueue::GetForCurrentThread()) {
            DispatcherQueueOptions options{sizeof(DispatcherQueueOptions),DQTYPE_THREAD_CURRENT,DQTAT_COM_NONE};
            check_hresult(CreateDispatcherQueueController(options,reinterpret_cast<ABI::Windows::System::IDispatcherQueueController**>(put_abi(queue))));
        }
        auto ctx=std::make_unique<Context>();ctx->hwnd=hwnd;
        BOOL enabled=TRUE;check_hresult(DwmSetWindowAttribute(hwnd,17,&enabled,sizeof(enabled)));
        ctx->compositor=Compositor();
        auto interop=ctx->compositor.as<ABI::Windows::UI::Composition::Desktop::ICompositorDesktopInterop>();
        check_hresult(interop->CreateDesktopWindowTarget(hwnd,FALSE,reinterpret_cast<ABI::Windows::UI::Composition::Desktop::IDesktopWindowTarget**>(put_abi(ctx->target))));
        ctx->root=ctx->compositor.CreateContainerVisual();ctx->root.RelativeSizeAdjustment({1,1});ctx->target.Root(ctx->root);
        ctx->controller=DesktopAcrylicController();ctx->config=SystemBackdropConfiguration();
        // Scratchpad material remains visible while another app is focused; system policy still applies.
        ctx->config.IsInputActive(true);ctx->config.Theme(SystemBackdropTheme::Dark);
        ctx->controller.SetSystemBackdropConfiguration(ctx->config);
        if(!ctx->controller.SetTarget(Microsoft::UI::WindowId{reinterpret_cast<uint64_t>(hwnd)},ctx->target)) {last_error="SetTarget returned false";return E_FAIL;}
        *output=ctx.release();last_error.clear();return S_OK;
    } catch(hresult_error const& error) {return fail(error);} catch(...) {last_error="Unexpected controller creation error";return E_FAIL;}
}
extern "C" __declspec(dllexport) int __stdcall QMSet(void* opaque,float tint,float luminosity,unsigned int rgb) {
    try {
        ensure_ui(); if(!opaque||!std::isfinite(tint)||!std::isfinite(luminosity)||tint<0||tint>1||luminosity<0||luminosity>1) return E_INVALIDARG;
        auto ctx=static_cast<Context*>(opaque);
        Windows::UI::Color color{255,static_cast<uint8_t>((rgb>>16)&255),static_cast<uint8_t>((rgb>>8)&255),static_cast<uint8_t>(rgb&255)};
        ctx->controller.TintColor(color);ctx->controller.FallbackColor(color);
        ctx->controller.TintOpacity(tint);ctx->controller.LuminosityOpacity(luminosity);
        last_error.clear();return S_OK;
    } catch(hresult_error const& error) {return fail(error);} catch(...) {last_error="Unexpected controller update error";return E_FAIL;}
}
static std::string escaped(std::string const& value) {
    std::string result;for(unsigned char ch:value){if(ch=='\\'||ch=='"')result+='\\';if(ch>=32)result+=ch;}return result;
}
extern "C" __declspec(dllexport) int __stdcall QMInfo(void* opaque,char* output,int capacity) {
    try {
        ensure_ui();std::ostringstream text;text.imbue(std::locale::classic());
        if(opaque) {auto ctx=static_cast<Context*>(opaque);auto color=ctx->controller.TintColor();text<<"{\"tintOpacity\":"<<ctx->controller.TintOpacity()<<",\"luminosityOpacity\":"<<ctx->controller.LuminosityOpacity()<<",\"state\":"<<static_cast<int>(ctx->controller.State())<<",\"tintColor\":["<<static_cast<int>(color.R)<<","<<static_cast<int>(color.G)<<","<<static_cast<int>(color.B)<<"]}";}
        else text<<"{\"error\":\""<<escaped(last_error)<<"\"}";
        auto value=text.str();if(!output||capacity<=static_cast<int>(value.size()))return E_INVALIDARG;
        std::memcpy(output,value.c_str(),value.size()+1);return S_OK;
    } catch(hresult_error const& error) {return fail(error);} catch(...) {return E_FAIL;}
}
extern "C" __declspec(dllexport) int __stdcall QMClose(void* opaque) {
    try {ensure_ui();auto ctx=std::unique_ptr<Context>(static_cast<Context*>(opaque));return S_OK;} catch(...) {return E_FAIL;}
}
