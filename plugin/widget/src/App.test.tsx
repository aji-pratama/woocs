import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import App from './App';

describe('App Widget', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    window.WooCS = {
      store_id: 'test-store',
      api_url: 'http://localhost:8001',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders start a conversation if no history', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    render(<App />);

    // Open chat
    const button = screen.getByLabelText(/Open chat/i);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Hi! I'm your/i)).toBeInTheDocument();
    });
  });

  test('hides quick replies when disabled in config', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    window.WooCS = {
      store_id: 'test-store',
      api_url: 'http://localhost:8001',
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

  test('sends a user message and renders bot response', async () => {
    // Initial history fetch
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    // Chat reply fetch
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'We have blue sneakers in stock!',
        confidence: 0.9,
        escalated: false,
        session_id: 'sess-123',
        response_type: 'text',
        metadata: null,
      }),
    });

    render(<App />);

    // Open chat
    fireEvent.click(screen.getByLabelText(/Open chat/i));

    await waitFor(() => {
      expect(screen.getByText(/Hi! I'm your/i)).toBeInTheDocument();
    });

    // Type message
    const input = screen.getByPlaceholderText(/Ask anything/i);
    fireEvent.change(input, { target: { value: 'Do you have sneakers?' } });

    // Submit form
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    // Verify user message appeared
    expect(screen.getByText('Do you have sneakers?')).toBeInTheDocument();

    // Verify bot response appears
    await waitFor(() => {
      expect(screen.getByText('We have blue sneakers in stock!')).toBeInTheDocument();
    });
  });

  test('clicking a quick reply triggers sending that message', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'Please provide your order number.',
        confidence: 0.85,
        escalated: false,
        session_id: 'sess-123',
        response_type: 'text',
        metadata: null,
      }),
    });

    render(<App />);
    fireEvent.click(screen.getByLabelText(/Open chat/i));

    await waitFor(() => {
      expect(screen.getByText(/Check my order/i)).toBeInTheDocument();
    });

    // Click quick reply
    fireEvent.click(screen.getByText(/Check my order/i));

    await waitFor(() => {
      expect(screen.getByText('Please provide your order number.')).toBeInTheDocument();
    });
  });

  test('handles API network failure gracefully without crashing', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    // Fail chat request
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network disconnected'));

    render(<App />);
    fireEvent.click(screen.getByLabelText(/Open chat/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask anything/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Ask anything/i);
    fireEvent.change(input, { target: { value: 'test network fail' } });
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });
  });
});
