// 0.24.0: the capture card window. Shows a USB HDMI capture device (an Xbox, PlayStation, Switch or
// anything else plugged into it) with its sound, as close to live as Windows allows. Picks the
// capture card by itself, remembers your choices, and never sends the picture anywhere.

const $ = (id) => document.getElementById(id);
const v = $('v');
const prefs = {
  get(k, d) { try { const x = localStorage.getItem(`cap.${k}`); return x == null ? d : JSON.parse(x); } catch { return d; } },
  set(k, val) { try { localStorage.setItem(`cap.${k}`, JSON.stringify(val)); } catch {} },
};
// Names capture cards use. Webcams are only picked if nothing like this is plugged in.
const CAPTURE = /capture|cam ?link|hdmi|elgato|avermedia|live gamer|uvc|usb3|usb video|video ?grabber|4k|game|razer ripsaw|magewell|ezcap|genki|hagibis|mirabox/i;
const WEBCAM = /webcam|integrated|facetime|c9\d\d|brio|kiyo|hd pro|face/i;
let stream = null;

function show(title, text, { spin = false, retry = false } = {}) {
  $('msg').hidden = false;
  $('spin').hidden = !spin;
  $('msgT').textContent = title;
  $('msgP').textContent = text || '';
  $('retry').hidden = !retry;
}
function hide() { $('msg').hidden = true; }

async function devices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return { video: all.filter((d) => d.kind === 'videoinput'), audio: all.filter((d) => d.kind === 'audioinput') };
}

function pickVideo(list) {
  const saved = prefs.get('device', '');
  return list.find((d) => d.deviceId === saved)
    || list.find((d) => CAPTURE.test(d.label) && !WEBCAM.test(d.label))
    || list.find((d) => !WEBCAM.test(d.label))
    || list[0];
}

// The capture card's own sound input: same hardware group, else a name that matches.
function pickAudio(list, cam) {
  if (!cam) return null;
  const words = cam.label.toLowerCase().replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => w.length > 2);
  return list.find((a) => a.groupId && a.groupId === cam.groupId)
    || list.find((a) => words.some((w) => a.label.toLowerCase().includes(w)))
    || list.find((a) => CAPTURE.test(a.label) && !/microphone array|realtek|headset|steelseries|arctis|hyperx|blue yeti|webcam/i.test(a.label))
    || null;
}

function stop() {
  if (stream) for (const t of stream.getTracks()) t.stop();
  stream = null;
  v.srcObject = null;
}

async function start() {
  stop();
  show('Looking for your capture card', '', { spin: true });
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { show('Capture is not available', 'This window cannot use video devices.', { retry: true }); return; }
  try {
    // Device names are only shown once a device has been opened, so open any first if needed.
    let { video, audio } = await devices();
    if (video.length && !video[0].label) {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      tmp.getTracks().forEach((t) => t.stop());
      ({ video, audio } = await devices());
    }
    if (!video.length) { show('No capture card found', 'Plug the capture card into a USB 3 port (usually blue), connect your console to its HDMI in, then try again.', { retry: true }); return; }
    const cam = pickVideo(video);
    const mic = pickAudio(audio, cam);
    fillDevices(video, cam);
    const [w, hgt, fps] = String(prefs.get('mode', '1920x1080x60')).split('x').map(Number);
    $('mode').value = `${w}x${hgt}x${fps}`;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: cam.deviceId }, width: { ideal: w }, height: { ideal: hgt }, frameRate: { ideal: fps } },
      // Game sound as it comes: no echo cancelling, noise removal or level changes.
      audio: mic ? { deviceId: { exact: mic.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 } : false,
    });
    v.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener('ended', () => show('The capture card disconnected', 'Check its USB cable, then try again. It reconnects by itself when plugged back in.', { retry: true }));
    applyVolume();
    await v.play().catch(() => {});
    hide();
    describe(mic);
  } catch (e) {
    const n = e && e.name;
    if (n === 'NotReadableError' || n === 'TrackStartError') show('The capture card is busy', 'Another program is using it, like OBS, Discord or the capture card\'s own app. Close it there, then try again.', { retry: true });
    else if (n === 'OverconstrainedError') { prefs.set('mode', '1920x1080x60'); show('That resolution did not work', 'Switched back to 1080p 60. Try again.', { retry: true }); }
    else if (n === 'NotAllowedError') show('Windows blocked the capture card', 'Open Windows Settings, Privacy & security, Camera, and turn on camera access for desktop apps. Capture cards count as cameras there.', { retry: true });
    else show('The capture card did not start', (e && e.message) || 'Unplug it, plug it back in, then try again.', { retry: true });
  }
}

function fillDevices(video, cam) {
  const sel = $('dev');
  sel.replaceChildren(...video.map((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `Video device ${i + 1}`; o.selected = d.deviceId === cam.deviceId; return o; }));
}

function describe(mic) {
  const t = stream && stream.getVideoTracks()[0];
  if (!t) return;
  const s = t.getSettings();
  const res = s.height ? `${s.height >= 2160 ? '4K' : `${s.height}p`} ${Math.round(s.frameRate || 0)}` : '';
  $('info').textContent = [res, mic ? '' : 'no sound found'].filter(Boolean).join(' · ');
  $('info').title = mic ? `Sound from ${mic.label}` : 'No sound input matched the capture card. Its sound may be set up as a separate device in Windows Sound settings.';
}

function applyVolume() {
  const vol = prefs.get('volume', 100);
  const muted = prefs.get('muted', false);
  v.volume = vol / 100;
  v.muted = muted;
  $('vol').value = vol;
  $('mute').textContent = muted ? 'Sound off' : 'Sound on';
  $('mute').classList.toggle('on', muted);
}

$('dev').addEventListener('change', () => { prefs.set('device', $('dev').value); start(); });
$('mode').addEventListener('change', () => { prefs.set('mode', $('mode').value); start(); });
$('vol').addEventListener('input', () => { prefs.set('volume', Number($('vol').value)); if (prefs.get('muted', false) && Number($('vol').value) > 0) prefs.set('muted', false); applyVolume(); });
$('mute').addEventListener('click', () => { prefs.set('muted', !prefs.get('muted', false)); applyVolume(); });
$('retry').addEventListener('click', start);

const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); };
$('full').addEventListener('click', toggleFull);
v.addEventListener('dblclick', toggleFull);
document.addEventListener('fullscreenchange', () => { $('full').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.key === 'F11' || e.key === 'f') { e.preventDefault(); toggleFull(); }
  else if (e.key === 'm' || e.key === 'M') $('mute').click();
});

// The bar and the pointer get out of the way while you play.
let idleT = 0;
const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => { if (!$('bar').matches(':hover') && !$('bar').contains(document.activeElement)) document.body.classList.add('idle'); }, 2500); };
for (const ev of ['mousemove', 'mousedown', 'keydown']) document.addEventListener(ev, wake);
wake();

// Plugging the card in (or out) while this is open.
navigator.mediaDevices && navigator.mediaDevices.addEventListener('devicechange', () => {
  const live = stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
  if (!live) start();
});
start();
