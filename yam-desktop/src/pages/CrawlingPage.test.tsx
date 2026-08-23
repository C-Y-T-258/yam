import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addCrawlingLog: vi.fn(),
  addMajor: vi.fn(),
  fetchAvailableMajors: vi.fn(),
  getCrawlProgress: vi.fn(),
  setCrawlingProgress: vi.fn(),
  setCrawlTarget: vi.fn(),
  setPage: vi.fn(),
  setSelectedMajorCodes: vi.fn(),
  syncWorkspaceData: vi.fn(),
  updateCrawlingProgress: vi.fn(),
  updateMajor: vi.fn(),
}));

vi.mock('../stores/appStore', () => ({
  useAppStore: () => ({
    crawlingProgress: null,
    setCrawlingProgress: mocks.setCrawlingProgress,
    updateCrawlingProgress: mocks.updateCrawlingProgress,
    addCrawlingLog: mocks.addCrawlingLog,
    setPage: mocks.setPage,
    crawlTarget: { code: '0821Z5', name: '非织造材料与工程' },
    setCrawlTarget: mocks.setCrawlTarget,
    updateMajor: mocks.updateMajor,
    addMajor: mocks.addMajor,
    crawledMajors: [],
    setSelectedMajorCodes: mocks.setSelectedMajorCodes,
  }),
}));

vi.mock('../components/TopNav', () => ({ TopNav: () => null }));
vi.mock('../components/LoginRequiredModal', () => ({ LoginRequiredModal: () => null }));

vi.mock('../lib/db', () => ({
  runCrawl: vi.fn(),
  getCrawlProgress: mocks.getCrawlProgress,
  syncWorkspaceData: mocks.syncWorkspaceData,
  fetchAvailableMajors: mocks.fetchAvailableMajors,
  cancelCrawl: vi.fn(),
  checkLoginStatus: vi.fn(),
  loginYanzhao: vi.fn(),
  getCrawlErrorPresentation: vi.fn(() => null),
  normalizeAppError: vi.fn((error: unknown) => ({ code: 'FAILED', message: String(error) })),
}));

import { CrawlingPage } from './CrawlingPage';

describe('CrawlingPage completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCrawlProgress.mockResolvedValue({
      status: 'completed',
      running: false,
      major_code: '0821Z5',
      current: 1,
      total: 1,
      current_name: '测试大学',
      done: true,
      success: 1,
      failed: 0,
      skipped: 0,
      error_code: null,
      error: null,
    });
    mocks.fetchAvailableMajors.mockResolvedValue([
      { major_code: '0821Z5', school_count: 1 },
    ]);
  });

  it('uses the backend-synced result without starting a second sync process', async () => {
    render(<CrawlingPage />);

    await waitFor(() => expect(mocks.setPage).toHaveBeenCalledWith('workspace'));

    expect(mocks.syncWorkspaceData).not.toHaveBeenCalled();
    expect(mocks.setSelectedMajorCodes).toHaveBeenCalledWith(['0821Z5']);
    expect(mocks.addMajor).toHaveBeenCalledWith(expect.objectContaining({
      code: '0821Z5',
      schoolCount: 1,
    }));
  });
});
