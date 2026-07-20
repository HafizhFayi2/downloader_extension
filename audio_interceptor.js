// ==========================================
// UNIVERSAL AUDIO INTERCEPTOR (MAIN WORLD)
// ElevenLabs, Suno AI, Udio, SoundCloud
// ==========================================
(function injectAudioInterceptor() {
  const AUDIO_HOSTS = ['elevenlabs.io', 'suno.com', 'udio.com', 'soundcloud.com'];
  if (!AUDIO_HOSTS.some(h => location.hostname.includes(h))) return;

  // Determine site prefix for filename
  const prefixMap = { 'elevenlabs.io': 'ElevenLabs', 'suno.com': 'SunoAI', 'udio.com': 'Udio', 'soundcloud.com': 'SoundCloud' };
  const sitePrefix = Object.keys(prefixMap).reduce((acc, key) => location.hostname.includes(key) ? prefixMap[key] : acc, 'Audio');

  const origFetch = window.fetch;
  window.fetch = async function() {
    var response = await origFetch.apply(this, arguments);
    try {
      var url = typeof arguments[0] === "string" ? arguments[0] : (arguments[0] && arguments[0].url);
      if (url) {
        var clone = response.clone();
        var blob = await clone.blob();
        if (blob.size > 0 && blob.type && blob.type.includes("audio/")) {
          var reader = new FileReader();
          reader.onloadend = function() {
            var base64 = reader.result.split(",")[1];
            var ext = (blob.type.includes("mp3") || blob.type.includes("mpeg")) ? "mp3" : blob.type.includes("ogg") ? "ogg" : "wav";
            window.dispatchEvent(new CustomEvent("UniversalAudioCaptured", {
              detail: { base64: base64, mimeType: blob.type, filename: sitePrefix + "_" + Date.now() + "." + ext, url: url }
            }));
          };
          reader.readAsDataURL(blob);
        }
      }
    } catch(e) {}
    return response;
  };
})();
