#import "RCTTelephonyModule.h"
#import <CoreTelephony/CTTelephonyNetworkInfo.h>
#import <CoreTelephony/CTCarrier.h>

@implementation RCTTelephonyModule

RCT_EXPORT_MODULE(TelephonyModule);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(getCellularInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    CTTelephonyNetworkInfo *netInfo = [[CTTelephonyNetworkInfo alloc] init];
    
    NSString *carrierName = nil;
    NSString *radioTech = nil;
    
    // Extract Carrier Name
    if (@available(iOS 12.0, *)) {
      NSDictionary<NSString *, CTCarrier *> *providers = netInfo.serviceSubscriberCellularProviders;
      if (providers && providers.count > 0) {
        for (NSString *key in providers) {
          CTCarrier *carrier = providers[key];
          if (carrier.carrierName && carrier.carrierName.length > 0) {
            carrierName = carrier.carrierName;
            break;
          }
        }
      }
    }
    
    // Extract Radio Access Technology (5G, LTE/4G, 3G, 2G)
    NSString *rawTech = nil;
    if (@available(iOS 12.0, *)) {
      NSDictionary<NSString *, NSString *> *techDict = netInfo.serviceCurrentRadioAccessTechnology;
      if (techDict && techDict.count > 0) {
        rawTech = techDict.allValues.firstObject;
      }
    }
    
    if (rawTech) {
      if ([rawTech isEqualToString:CTRadioAccessTechnologyNR] ||
          [rawTech isEqualToString:CTRadioAccessTechnologyNRNSA]) {
        radioTech = @"5G";
      } else if ([rawTech isEqualToString:CTRadioAccessTechnologyLTE]) {
        radioTech = @"4G / LTE";
      } else if ([rawTech isEqualToString:CTRadioAccessTechnologyWCDMA] ||
                 [rawTech isEqualToString:CTRadioAccessTechnologyHSDPA] ||
                 [rawTech isEqualToString:CTRadioAccessTechnologyHSUPA] ||
                 [rawTech isEqualToString:CTRadioAccessTechnologyCDMA1x] ||
                 [rawTech isEqualToString:CTRadioAccessTechnologyCDMAEVDORev0] ||
                 [rawTech isEqualToString:CTRadioAccessTechnologyCDMAEVDORevA] ||
                 [rawTech isEqualToString:CTRadioAccessTechnologyCDMAEVDORevB] ||
                 [rawTech isEqualToString:CTRadioAccessTechnologyeHRPD]) {
        radioTech = @"3G";
      } else if ([rawTech isEqualToString:CTRadioAccessTechnologyGPRS] ||
                 [rawTech isEqualToString:CTRadioAccessTechnologyEdge]) {
        radioTech = @"2G";
      } else {
        radioTech = [rawTech stringByReplacingOccurrencesOfString:@"CTRadioAccessTechnology" withString:@""];
      }
    }
    
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    result[@"carrier"] = carrierName ?: [NSNull null];
    result[@"radio"] = radioTech ?: [NSNull null];
    
    resolve(result);
  } @catch (NSException *exception) {
    reject(@"telephony_error", exception.reason, nil);
  }
}

@end
