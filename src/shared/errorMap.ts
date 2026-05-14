export type CrawlerErrorType =
  | 'cookie_expired'
  | 'rate_limited'
  | 'network_error'
  | 'browser_fallback'
  | 'timeout'
  | 'platform_unavailable'
  | 'validation_error'
  | 'unknown';

export interface FriendlyError {
  type: CrawlerErrorType;
  rawMessage: string;
  userMessage: string;
  actionable: boolean;
  action?: 'retry' | 'check_cookies' | 'reduce_count' | 'wait';
  actionLabel?: string;
}

const ERROR_PATTERNS: Array<{
  patterns: string[];
  type: CrawlerErrorType;
  userMessage: string;
  actionable: boolean;
  action?: 'retry' | 'check_cookies' | 'reduce_count' | 'wait';
  actionLabel?: string;
}> = [
  {
    patterns: ['403', 'unauthorized', 'cookie', 'session', '登录', '未授权', '身份验证'],
    type: 'cookie_expired',
    userMessage: 'Cookie 已过期或无效，请重新登录并更新账号设置中的 Cookie',
    actionable: true,
    action: 'check_cookies',
    actionLabel: '检查 Cookie',
  },
  {
    patterns: ['429', 'rate limit', 'too many requests', '频率', '过于频繁'],
    type: 'rate_limited',
    userMessage: '请求过于频繁，平台暂时限制了访问，请稍后再试',
    actionable: true,
    action: 'wait',
    actionLabel: '稍后再试',
  },
  {
    patterns: ['timeout', 'etimedout', 'timed out', '超时'],
    type: 'timeout',
    userMessage: '连接超时，请检查网络连接后重试',
    actionable: true,
    action: 'retry',
    actionLabel: '重试',
  },
  {
    patterns: ['network error', 'econnrefused', 'enotfound', '网络', '断开'],
    type: 'network_error',
    userMessage: '网络连接失败，请检查网络设置',
    actionable: true,
    action: 'retry',
    actionLabel: '重试',
  },
  {
    patterns: ['fallback', 'backup mode', 'browser fallback', '兜底', '备用模式'],
    type: 'browser_fallback',
    userMessage: '已自动切换至备用采集模式，采集速度可能稍慢',
    actionable: false,
  },
  {
    patterns: ['playwright', 'chromium', 'browser', '浏览器启动失败'],
    type: 'platform_unavailable',
    userMessage: '浏览器环境异常，请检查 Playwright 是否安装完整',
    actionable: true,
    action: 'retry',
    actionLabel: '重试',
  },
  {
    patterns: ['captcha', '验证', 'verification', '人机验证'],
    type: 'rate_limited',
    userMessage: '平台触发了验证码，建议减少采集数量或稍后重试',
    actionable: true,
    action: 'reduce_count',
    actionLabel: '减少数量',
  },
];

export function classifyError(rawMessage: string): FriendlyError {
  const lower = rawMessage.toLowerCase();

  for (const rule of ERROR_PATTERNS) {
    if (rule.patterns.some((p) => lower.includes(p.toLowerCase()))) {
      return {
        type: rule.type,
        rawMessage,
        userMessage: rule.userMessage,
        actionable: rule.actionable,
        action: rule.action,
        actionLabel: rule.actionLabel,
      };
    }
  }

  return {
    type: 'unknown',
    rawMessage,
    userMessage: rawMessage || '发生未知错误，请稍后重试',
    actionable: true,
    action: 'retry',
    actionLabel: '重试',
  };
}

export function getFriendlyMessage(rawMessage: string): string {
  return classifyError(rawMessage).userMessage;
}
