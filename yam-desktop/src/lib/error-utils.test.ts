import { describe, expect, it, vi } from 'vitest';
import { getCrawlErrorPresentation, invokeApp, normalizeAppError, type AppError } from './db';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('normalizeAppError', () => {
  it('保留完整 AppError 对象字段', () => {
    const input: AppError = {
      code: 'LOGIN_REQUIRED',
      message: '登录已过期',
      impact: '采集暂停',
      action: '重新登录',
      retryable: false,
      cause: 'expired',
    };

    expect(normalizeAppError(input, 'fallback')).toEqual(input);
  });

  it('归一化 Tauri reject 普通对象并补齐默认字段', () => {
    expect(normalizeAppError({ code: 'UNREACHABLE', message: '连接失败' }, 'fallback')).toMatchObject({
      code: 'UNREACHABLE',
      message: '连接失败',
      retryable: true,
      impact: expect.stringContaining('保留'),
    });
  });

  it('归一化 Rust 数据库结构化错误对象', () => {
    expect(normalizeAppError({
      code: 'DB_QUERY_FAILED',
      message: '加载院校时数据库内部发生异常',
      impact: '本次查询未完成，现有数据未改变。',
      action: '请重试；若仍失败，请重启应用。',
      retryable: true,
    }, 'fallback')).toMatchObject({
      code: 'DB_QUERY_FAILED',
      message: '加载院校时数据库内部发生异常',
      retryable: true,
      impact: '本次查询未完成，现有数据未改变。',
    });
  });

  it('解析 JSON 字符串错误', () => {
    expect(normalizeAppError('{"code":"UNKNOWN_MAJOR","message":"目录过期"}', 'fallback')).toMatchObject({
      code: 'UNKNOWN_MAJOR',
      message: '目录过期',
      retryable: false,
    });
  });

  it('保留普通字符串错误', () => {
    expect(normalizeAppError('数据库不可用', 'fallback')).toMatchObject({
      code: 'UNKNOWN',
      message: '数据库不可用',
    });
  });

  it('提取 Error message 并保留 cause', () => {
    const error = new Error('原生异常');
    const normalized = normalizeAppError(error, 'fallback');

    expect(normalized).toMatchObject({ code: 'UNKNOWN', message: '原生异常' });
    expect(normalized.cause).toBe(error);
  });

  it('无可用消息时使用 fallback', () => {
    expect(normalizeAppError(null, '操作失败')).toMatchObject({
      code: 'UNKNOWN',
      message: '操作失败',
    });
  });
});

describe('invokeApp', () => {
  it('抛出兼容 Error 与 AppError 字段的统一错误', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce({ code: 'FAILED', message: 'IPC 失败' });

    try {
      await invokeApp('test_command', undefined, 'fallback');
      expect.unreachable('invokeApp 应抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ code: 'FAILED', message: 'IPC 失败', retryable: true });
    }
  });
});

describe('getCrawlErrorPresentation', () => {
  it.each([
    ['LOGIN_REQUIRED', 'failed', '失效', '需要登录', 'login', false],
    ['UNKNOWN_MAJOR', 'failed', '未知专业', '专业目录需更新', 'major-select', false],
    ['NO_PUBLIC_DATA', 'failed', '无数据', '暂无公开数据', 'major-management', false],
    ['BROWSER_MISSING', 'failed', '缺少 Edge', 'Microsoft Edge 不可用', 'settings', false],
    ['BACKEND_MISSING', 'failed', '后端缺失', '内置后端不可用', 'settings', false],
    ['UNREACHABLE', 'failed', '网络失败', '暂时无法连接数据源', 'retry', true],
    ['TIMEOUT', 'failed', '超时', '采集超时', 'retry', true],
    ['FAILED', 'failed', '失败', '采集失败', 'retry', true],
    [null, 'cancelled', '用户取消', '采集已取消', 'retry', true],
  ] as const)('映射错误码 %s', (code, status, message, title, actionType, retryable) => {
    expect(getCrawlErrorPresentation(code, status, message)).toMatchObject({
      title,
      actionType,
      retryable,
    });
  });

  it('仅在无 error_code 时保留旧登录文案 fallback', () => {
    expect(getCrawlErrorPresentation(null, 'failed', '请先登录研招网').actionType).toBe('login');
    expect(getCrawlErrorPresentation('FAILED', 'failed', '请先登录研招网').actionType).toBe('retry');
  });

  it('无公开数据说明不是程序故障且不允许重试', () => {
    const presentation = getCrawlErrorPresentation('NO_PUBLIC_DATA', 'failed', '暂无数据');
    expect(presentation.impact).toContain('不是程序故障');
    expect(presentation.retryable).toBe(false);
  });
});
