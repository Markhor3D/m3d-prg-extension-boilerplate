import getUserMedia from 'get-user-media-promise';

let canvasStream = null;
let pollInterval = 0;
let drawLoopActive = false;

document.addEventListener("visibilitychange", () => {
    if (document.hidden) pollInterval = 1000; // slower
    else pollInterval = 0; // full 25 fps
});
let
 drawCount = 0;
let lastDraw = Date.now();
async function getCanvasBasedMJPEGStream(mjpegUrl) {
    drawLoopActive = true;
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    let lastDrawTime = Date.now();
    let frameCount = 0;

    async function drawLoop() {
        if (!drawLoopActive)
            return;
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timestamp = Date.now();
        img.src = `${mjpegUrl}?t=${timestamp}`; // Prevent caching

        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            frameCount++;

            const now = Date.now();
            if (now - lastDrawTime >= 1000) {
                console.log("🖼️ canvas draw fps:", frameCount);
                lastDrawTime = now;
                frameCount = 0;
            }

            // Pull the next frame only after successful draw
            setTimeout(drawLoop, pollInterval); // Or add delay if needed
        };

        img.onerror = () => {
            console.warn("❌ Failed to load frame, retrying...");
            setTimeout(drawLoop, 100); // Retry after delay
        };
    }

    drawLoop();

    return canvas.captureStream(25);
}


// Single Setup For All Video Streams used by the GUI
// While VideoProvider uses a private _singleSetup
// property to ensure that each instance of a VideoProvider
// use the same setup, this ensures that all instances
// of VideoProviders use a single stream. This way, closing a camera modal
// does not affect the video on the stage, and a program running and disabling
// video on the stage will not affect the camera modal's video.
const requestStack = [];
const requestVideoStream = async videoDesc => {
    let streamPromise;
    if (requestStack.length === 0) {
         try {
            console.log('Trying M3D cam host');
            const res = await fetch("http://localhost:4321/status");
            console.log('Result: ', res);
            const status = await res.json();
            console.log('Result.json: ', status);
            if (status.server) {
                const useM3D = confirm("🚀 M3D Camera detected. Use it instead of your webcam?");
                if (useM3D) {
                    console.log('Use M3D Cam');
                    pollInterval = 0;

                    const stream = await getCanvasBasedMJPEGStream("http://localhost:4321/frame");
                    canvasStream = stream;
                    // Create virtual stream from your /frame endpoint
                    console.log('Got Stream:', stream);
                    streamPromise = Promise.resolve(stream);
                    requestStack.push(streamPromise);
                    return streamPromise;
                }
            }
        } catch (e) {
            // Silent fail — fallback to normal camera
        }

        streamPromise = getUserMedia({
            audio: false,
            video: videoDesc
        });
        requestStack.push(streamPromise);
    } else if (requestStack.length > 0) {
        streamPromise = requestStack[0];
        requestStack.push(true);
    }
    return streamPromise;
};

const requestDisableVideo = () => {
    requestStack.pop();
    if (requestStack.length > 0) return false;

    // Stop our MJPEG polling if active
    drawLoopActive = false;
    if (canvasStream) {
        const tracks = canvasStream.getTracks();
        tracks.forEach(t => t.stop());
        canvasStream = null;
    }

    return true;
};


export {
    requestVideoStream,
    requestDisableVideo
};
