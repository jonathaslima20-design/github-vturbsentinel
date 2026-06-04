declare global {
  interface Window {
    fbq: (...args: any[]) => void;
  }
}

function generateEventId(): string {
  return `vt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function trackPixelEvent(eventName: string, params?: Record<string, any>, eventId?: string) {
  if (typeof window !== 'undefined' && window.fbq) {
    if (eventId) {
      window.fbq('track', eventName, params || {}, { eventID: eventId });
    } else {
      window.fbq('track', eventName, params);
    }
  }
}

async function sendServerEvent(eventName: string, eventData?: Record<string, any>, userData?: Record<string, any>, eventId?: string) {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventName,
        eventId,
        eventData,
        userData,
        sourceUrl: window.location.href,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc'),
      }),
    });
  } catch (e) {
    console.warn('Meta CAPI event failed:', e);
  }
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match?.[2];
}

export function trackLead(email?: string) {
  const eventId = generateEventId();
  trackPixelEvent('Lead', { content_name: 'cadastro_free' }, eventId);
  sendServerEvent('Lead', { content_name: 'cadastro_free' }, { email }, eventId);
}

export function trackViewPricing() {
  trackPixelEvent('ViewContent', { content_name: 'pricing_page' });
}

export function trackInitiateCheckout(planName: string, value: number) {
  const eventId = generateEventId();
  const params = { content_name: planName, value, currency: 'BRL' };
  trackPixelEvent('InitiateCheckout', params, eventId);
  sendServerEvent('InitiateCheckout', params, {}, eventId);
}

export function trackPurchase(planName: string, value: number, email?: string) {
  const eventId = generateEventId();
  const params = { content_name: planName, value, currency: 'BRL' };
  trackPixelEvent('Purchase', params, eventId);
  sendServerEvent('Purchase', params, { email }, eventId);
}

export function trackCompleteRegistration() {
  trackPixelEvent('CompleteRegistration');
}
