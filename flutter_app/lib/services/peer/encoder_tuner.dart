import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../config/rtc_config.dart';

/// 发送端编码参数调优。
///
/// 为什么必须在编码侧调：Android 端 flutter_webrtc 的 getDisplayMedia 完全忽略
/// constraints（`GetUserMediaImpl.getDisplayMedia` 直接取 `display.getRealSize()`
/// 与 DEFAULT_FPS），因此 constraints 里写 maxWidth/maxHeight 对屏幕采集无效，
/// 实际分辨率只能靠 [RTCRtpEncoding.scaleResolutionDownBy] 收敛。
///
/// 注意：不要在这里按采集源真实分辨率改 scaleResolutionDownBy。实测对竖屏
/// 手机（1220x2700 采集）下发非整数下采样倍数并把 maxFramerate 降到 15 后，
/// MediaProjection 虚拟显示会在启动瞬间爆发一批 buffer 随后彻底停止出帧
/// （`captured 8 / 60s`），接收端全黑。下采样倍数与帧率保持 preset 原值。
class EncoderTuner {
  const EncoderTuner._();

  /// 屏幕共享：保分辨率优先，文字界面不因降帧而糊掉
  static Future<void> tuneScreen(
    RTCRtpSender sender,
    CapturePreset preset,
  ) async {
    await _apply(
      sender,
      preset,
      degradation: RTCDegradationPreference.MAINTAIN_RESOLUTION,
    );
  }

  /// 摄像头：兼顾运动流畅度
  static Future<void> tuneCamera(
    RTCRtpSender sender,
    CapturePreset preset,
  ) async {
    await _apply(
      sender,
      preset,
      degradation: RTCDegradationPreference.BALANCED,
    );
  }

  static Future<void> _apply(
    RTCRtpSender sender,
    CapturePreset preset, {
    required RTCDegradationPreference degradation,
  }) async {
    try {
      // RTCRtpSender.parameters 是同步 getter（底层在 addTrack 时缓存的快照）
      final params = sender.parameters;

      if (params.encodings == null || params.encodings!.isEmpty) {
        params.encodings = <RTCRtpEncoding>[RTCRtpEncoding()];
      }
      final encoding = params.encodings!.first;
      encoding.maxBitrate = preset.targetBitrateKbps * 1000;
      encoding.maxFramerate = preset.maxFrameRate;
      encoding.scaleResolutionDownBy = preset.scaleResolutionDownBy;

      params.degradationPreference = degradation;

      final ok = await sender.setParameters(params);
      if (!ok) {
        debugPrint('EncoderTuner: setParameters rejected by peer');
      } else {
        debugPrint(
          'EncoderTuner: applied scaleDownBy=${encoding.scaleResolutionDownBy} '
          'fps=${encoding.maxFramerate} kbps=${preset.targetBitrateKbps}',
        );
      }
    } catch (e) {
      // 编码调优失败不应中断建链，仅影响画质
      debugPrint('EncoderTuner: tune failed: $e');
    }
  }
}
