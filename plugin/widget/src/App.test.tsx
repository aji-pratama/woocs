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

  test('renders markdown bold and links formatted in bot response', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'No, this is **not a sock**. It is a **pair of Slim Fit Jeans** — [View details](http://localhost:8080/?p=12).',
        confidence: 0.95,
        escalated: false,
        session_id: 'sess-123',
        response_type: 'text',
        metadata: null,
      }),
    });

    render(<App />);
    fireEvent.click(screen.getByLabelText(/Open chat/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask anything/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Ask anything/i);
    fireEvent.change(input, { target: { value: 'is this a sock' } });
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      // Check that bold strong elements exist
      expect(screen.getByText('not a sock').tagName).toBe('STRONG');
      expect(screen.getByText('pair of Slim Fit Jeans').tagName).toBe('STRONG');
      // Check that link exists
      const link = screen.getByRole('link', { name: 'View details' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'http://localhost:8080/?p=12');
    });
  });

  test('clicking add to cart on a product card sends AJAX request with quantity 1', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'Here is the product you asked for.',
        confidence: 0.95,
        escalated: false,
        session_id: 'sess-123',
        response_type: 'product_card',
        metadata: {
          id: 42,
          name: 'Cool Hoodie',
          price: '49.99',
          stock_status: 'instock',
          wc_url: 'http://localhost:8080/?p=42',
        },
      }),
    });

    render(<App />);
    fireEvent.click(screen.getByLabelText(/Open chat/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask anything/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Ask anything/i);
    fireEvent.change(input, { target: { value: 'show me hoodie' } });
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Cool Hoodie')).toBeInTheDocument();
      expect(screen.getByText('Add to cart')).toBeInTheDocument();
    });

    // Mock AJAX add to cart response
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: false }),
    });

    fireEvent.click(screen.getByText('Add to cart'));

    await waitFor(() => {
      expect(screen.getByText('Added! ✓')).toBeInTheDocument();
    });

    // Check fetch call to ?wc-ajax=add_to_cart
    const lastFetchCall = (globalThis.fetch as any).mock.calls[(globalThis.fetch as any).mock.calls.length - 1];
    expect(lastFetchCall[0]).toContain('/?wc-ajax=add_to_cart');
    expect(lastFetchCall[1].method).toBe('POST');
  });
});
