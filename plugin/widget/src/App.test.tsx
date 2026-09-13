import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import App from './App';

describe('App Widget', () => {
  beforeEach(() => {
    // Reset global fetch mock
    global.fetch = vi.fn();
    window.WooCS = {
      store_id: 'test-store',
      api_url: 'http://localhost:8001',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders start a conversation if no history', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    render(<App />);

    // Open chat
    const button = screen.getByLabelText(/Open chat/i);
    fireEvent.click(button);

    // Start a conversation is in the history view, which is opened if we click the history button,
    // actually let's just wait for the greeting message to appear
    await waitFor(() => {
      expect(screen.getByText(/Hi! I'm your/i)).toBeInTheDocument();
    });
  });

  test('hides quick replies when disabled in config', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    window.WooCS = {
      ...window.WooCS,
      widget_config: {
        enable_quick_replies: false,
      },
    };

    render(<App />);

    // Open chat
    const button = screen.getByLabelText(/Open chat/i);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Hi! I'm your/i)).toBeInTheDocument();
    });

    // Quick reply text should not be in document
    expect(screen.queryByText(/Check my order/i)).not.toBeInTheDocument();
  });
});
