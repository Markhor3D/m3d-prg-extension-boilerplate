let startTime, endTime, startData, endData;
function formatSpeed(speedInBytesPerSecond) {
const suffixes = ["bytes/s", "KB/s", "MB/s", "GB/s", "TB/s"];
let index = 0;
while (speedInBytesPerSecond >= 200 && index < suffixes.length - 1) {
    speedInBytesPerSecond /= 1024;
    index++;
}
var roundedNum = speedInBytesPerSecond.toFixed(1);
if(speedInBytesPerSecond > 10)
    roundedNum = speedInBytesPerSecond.toFixed(0);
return `${roundedNum} ${suffixes[index]}`;
}
function downloadScriptAsString(url, onProgress) {
return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("GET", url, true);
    xhr.responseType = "text";

    xhr.onload = () => {
    if (xhr.status === 200) {
        resolve(xhr.responseText);
    } else {
        reject(`Failed to download script. Status: ${xhr.status}`);
    }
    };

    xhr.onerror = () => {
    reject("Error occurred during script download.");
    };
    xhr.onloadstart = function () {
    startTime = performance.now();
    startData = 0; // Initially no data received
    };

    xhr.onprogress = (event) => {
    if (event.lengthComputable) {
        const percentage = Math.round((event.loaded / event.total) * 100);

        endData = event.loaded;
        endTime = performance.now();

        // Calculate speed based on time and data received
        const durationInSeconds = (endTime - startTime) / 1000;
        const receivedData = endData - startData;
        const speedInBytesPerSecond = receivedData / durationInSeconds;
        

        onProgress(percentage, formatSpeed(speedInBytesPerSecond));
    }
    };

    xhr.send();
});
}

function injectScript(scriptString) {
const script = document.createElement("script");
script.textContent = scriptString;
document.head.appendChild(script);
}

const loaderBar = document.querySelector(".m3d-progress-fill");
const loadingText = document.querySelector(".m3d-loading-text");
const loadingPercentage = document.getElementById(
"m3d-loading-percentage"
);
const loadingspeed = document.getElementById("m3d-download-speed");

const scriptUrl = "lib.min.js"; // Replace with your script URL

downloadScriptAsString(scriptUrl, (percentage, speed) => {
loaderBar.style.width = `${percentage}%`;
loadingPercentage.textContent = `Downloading M3D Scratch (${percentage}%)`; // Update the percentage text
loadingspeed.innerText = speed;
})
.then((scriptString) => {
    console.log("Download complete. Injecting script to the document...");
    loaderBar.style.width = "100%"; // Ensure the bar is full at the end
    document.getElementById("m3d-overlay").remove();
    injectScript(scriptString);
})
.catch((error) => {
    console.error("Download failed:", error);
    loaderBar.style.backgroundColor = "red"; // Change color in case of failure
    loadingText.textContent = "Failed to download"; // Update text for failure
});