#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

// Serve the bundled Vite build with a stable origin across launches and updates.
@interface GameAssets : NSObject <WKURLSchemeHandler>
@end

@implementation GameAssets
- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {
    NSURL *url = task.request.URL;
    NSString *root = [[NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"www"] stringByStandardizingPath];
    NSString *path = url.path.length > 1 ? url.path : @"/index.html";
    NSString *file = [[root stringByAppendingPathComponent:path] stringByStandardizingPath];
    if (![url.host isEqualToString:@"localhost"] || ![file hasPrefix:[root stringByAppendingString:@"/"]]) {
        [task didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorBadURL userInfo:nil]];
        return;
    }
    NSError *error = nil;
    NSData *data = [NSData dataWithContentsOfFile:file options:NSDataReadingMappedIfSafe error:&error];
    if (!data) { [task didFailWithError:error]; return; }

    NSDictionary *types = @{@"html": @"text/html; charset=utf-8", @"js": @"text/javascript",
        @"css": @"text/css", @"webp": @"image/webp", @"png": @"image/png", @"mp4": @"video/mp4",
        @"woff2": @"font/woff2", @"otf": @"font/otf", @"txt": @"text/plain; charset=utf-8"};
    NSMutableDictionary *headers = [@{@"Content-Type": types[file.pathExtension.lowercaseString] ?: @"application/octet-stream",
        @"Accept-Ranges": @"bytes", @"Access-Control-Allow-Origin": @"*"} mutableCopy];
    NSInteger status = 200;
    NSRange bytes = NSMakeRange(0, data.length);
    NSString *requestRange = [task.request valueForHTTPHeaderField:@"Range"];
    if ([requestRange hasPrefix:@"bytes="]) {
        NSScanner *scan = [NSScanner scannerWithString:[requestRange substringFromIndex:6]];
        scan.charactersToBeSkipped = nil;
        long long first = 0, last = (long long)data.length - 1;
        BOOL valid;
        if ([scan scanString:@"-" intoString:NULL]) {
            long long suffix = 0;
            valid = [scan scanLongLong:&suffix] && suffix > 0;
            first = MAX(0, (long long)data.length - suffix);
        } else {
            valid = [scan scanLongLong:&first] && [scan scanString:@"-" intoString:NULL];
            if (valid && !scan.isAtEnd) valid = [scan scanLongLong:&last];
            last = MIN(last, (long long)data.length - 1);
        }
        if (valid && scan.isAtEnd && first >= 0 && first <= last) {
            bytes = NSMakeRange((NSUInteger)first, (NSUInteger)(last - first + 1));
            status = 206;
            headers[@"Content-Range"] = [NSString stringWithFormat:@"bytes %lld-%lld/%lu", first, last, (unsigned long)data.length];
        } else {
            status = 416;
            bytes = NSMakeRange(0, 0);
            headers[@"Content-Range"] = [NSString stringWithFormat:@"bytes */%lu", (unsigned long)data.length];
        }
    }
    headers[@"Content-Length"] = [NSString stringWithFormat:@"%lu", (unsigned long)bytes.length];
    [task didReceiveResponse:[[NSHTTPURLResponse alloc] initWithURL:url statusCode:status
        HTTPVersion:@"HTTP/1.1" headerFields:headers]];
    if (bytes.length && ![task.request.HTTPMethod isEqualToString:@"HEAD"])
        [task didReceiveData:bytes.length == data.length ? data : [data subdataWithRange:bytes]];
    [task didFinish];
}
- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task {
    // Bundled reads finish synchronously; there is no outstanding transfer to cancel.
}
@end

@interface GameController : UIViewController <WKNavigationDelegate>
@end
@implementation GameController
- (void)loadView {
    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    config.allowsInlineMediaPlayback = YES;
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    config.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    [config setURLSchemeHandler:[GameAssets new] forURLScheme:@"merch"];
    WKWebView *web = [[WKWebView alloc] initWithFrame:CGRectZero configuration:config];
    web.navigationDelegate = self;
    web.opaque = NO;
    web.backgroundColor = UIColor.blackColor;
    web.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    self.view = web;
    [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"merch://localhost/index.html"]]];
}
- (BOOL)prefersStatusBarHidden { return YES; }
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView { [webView reload]; }
@end

@interface GameScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation GameScene
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
    self.window.backgroundColor = UIColor.blackColor;
    self.window.rootViewController = [GameController new];
    [self.window makeKeyAndVisible];
}
@end

@interface GameApp : UIResponder <UIApplicationDelegate>
@end
@implementation GameApp
@end

int main(int argc, char **argv) {
    @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(GameApp.class)); }
}
