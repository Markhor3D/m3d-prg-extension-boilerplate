import getUserMedia from 'get-user-media-promise';

let canvasStream = null;
let pollInterval = 0;
let drawLoopActive = false;

document.addEventListener("visibilitychange", () => {
    if (document.hidden) pollInterval = 1000; // slower
    else pollInterval = 0; // full 25 fps
});
async function getCanvasBasedMJPEGStream(mjpegUrl) {
    drawLoopActive = true;
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    let lastDrawTime = Date.now();
    let frameCount = 0;

    async function drawLoop() {
        if (!drawLoopActive) {
            return;
        }

        try {
            const timestamp = Date.now();
            const response = await fetch(`${mjpegUrl}?t=${timestamp}`); // Add timestamp to prevent caching
            const imgBlob = await response.blob();
            const img = await createImageBitmap(imgBlob); // Use createImageBitmap for better performance with blob images

            //console.log('img loaded');
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous frame
            // Flip the image horizontally
            ctx.save(); // Save the current canvas state
            ctx.scale(-1, 1); // Flip the canvas horizontally

            // Draw the flipped image: we adjust the destination x position to be negative for flipping
            ctx.drawImage(img, -canvas.width, 0, canvas.width, canvas.height); // Draw the flipped image

            ctx.restore(); // Restore the original canvas state
            frameCount++;

            const now = Date.now();
            if (now - lastDrawTime >= 1000) {
                console.log("🖼️ canvas draw fps:", frameCount);
                lastDrawTime = now;
                frameCount = 0;
            }

            // Pull the next frame only after the current one is drawn
            setTimeout(drawLoop, 20); // Approx 25fps, adjust if needed

        } catch (err) {
            console.warn("❌ Failed to load frame, retrying...", err);
            setTimeout(drawLoop, 100); // Retry after delay
        }
    }

    drawLoop();

    return canvas.captureStream(10);
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
            const status = await res.json();
            console.log('Result: ', status);
            if (status.server) {
                const useM3D = confirm("🚀 M3D Camera detected. Use it instead of your webcam?");
                if (useM3D) {
                    console.log('Use M3D Cam');
                    pollInterval = 0;

                    const stream = await getCanvasBasedMJPEGStream("http://localhost:4321/frame"); // Use /frame endpoint
                    canvasStream = stream;
                    console.log('Got Stream:', stream);
                    streamPromise = Promise.resolve(stream);
                    requestStack.push(streamPromise);
                    return streamPromise;
                }
            }
        } catch (e) {
            console.log('No M3D Cam, reverting to system cam');
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
