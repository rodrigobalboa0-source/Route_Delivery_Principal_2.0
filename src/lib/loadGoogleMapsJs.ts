let googleMapsLoadingPromise: Promise<void> | null = null;

export function loadGoogleMapsJs(apiKey: string): Promise<void> {
  if ((window as any)?.google?.maps) return Promise.resolve();
  if (googleMapsLoadingPromise) return googleMapsLoadingPromise;

  googleMapsLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-google-maps-js="true"]') as HTMLScriptElement | null;
    if (existing) {
      const interval = setInterval(() => {
        if ((window as any)?.google?.maps) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(interval);
        if (!(window as any)?.google?.maps) reject(new Error('Google Maps não carregou.'));
      }, 12000);
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsJs = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Erro ao carregar Google Maps.'));
    document.head.appendChild(script);
  });

  return googleMapsLoadingPromise;
}
