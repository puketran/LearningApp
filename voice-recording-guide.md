# Voice Recording Feature Guide

## Overview

You can now record your voice for any sentence and play it back later. Recordings are saved on the server and accessible from all devices.

## How to Use

### Recording Your Voice

1. Open a sentence by clicking on it in the sentence list
2. In the sentence detail panel (right side), find the "Voice Recording" section
3. Click the **"Record"** button (🎤)
4. Allow microphone access when prompted by your browser
5. Speak the sentence clearly
6. Click **"Stop"** button to finish recording
7. The recording will be automatically uploaded to the server

### Playing Back Your Recording

1. Open the sentence with a recording
2. Click the **"Play"** button (▶️)
3. The recording will play through your speakers/headphones

### Deleting a Recording

1. Open the sentence with a recording
2. Click the **"Delete"** button (🗑️) next to the Play button
3. Confirm deletion when prompted
4. You can now record a new one

## Technical Details

### Storage Location

- All recordings are stored in the `recordings/` folder on the server
- File format: WebM audio (supported by all modern browsers)
- File naming: Uses sentence ID for organization

### Server Endpoints

- `POST /api/recordings/upload` - Upload a new recording
- `POST /api/recordings/check` - Check if recording exists for a sentence
- `GET /recordings/<filename>` - Serve the audio file

### Browser Compatibility

- Requires HTTPS for microphone access (or localhost for development)
- Works on all modern browsers: Chrome, Firefox, Edge, Safari
- Mobile support: iOS Safari, Chrome on Android

## Troubleshooting

### Microphone Access Denied

- Check browser settings and allow microphone access for this site
- On mobile, ensure the browser app has microphone permissions

### Recording Not Playing

- Check your volume settings
- Try refreshing the page
- Ensure the server is running

### Upload Failed

- Check your internet connection
- Ensure the server is running on port 5000
- Check server console for error messages

## Tips

- Record in a quiet environment for best quality
- Speak clearly and at a normal pace
- Use this feature to practice pronunciation
- Compare your recording with AI-generated TTS audio (for vocabulary)
