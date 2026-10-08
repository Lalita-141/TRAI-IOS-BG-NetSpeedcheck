#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeMonitorBridge, NSObject)

RCT_EXTERN_METHOD(start:(NSString *)serverUrl
                  interval:(double)interval
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isRunning:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
