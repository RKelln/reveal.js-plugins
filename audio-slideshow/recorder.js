/*****************************************************************
** Author: Asvin Goel, goel@telematique.eu
**
** A plugin for reveal.js allowing to record audio for a slide
** deck.
**
** Version: 1.0.0
**
** License: MIT license (see LICENSE.md)
**
** Credits:
** - Muaz Khan for RecordRTC.js
** - Stuart Knightley for JSzip.js
******************************************************************/

import JSZip from 'jszip'
import RecordRTC from 'recordrtc';

const Plugin = () => {

	// The reveal.js instance this plugin is attached to
	let deck;

    let audio = new Audio();
    let audioStream;
    let recordRTC;
    let zip = new JSZip();
    let indices;
    let recordedAudio;
    let canvas;
    let isRecording;
    let isPaused;
	// RecordRTC default config
	let recordRTCConfig =  { 
		type: 'audio',
		recorderType: 'MediaStreamRecorder',
		audioBitsPerSecond: 192000,
		sampleRate: 96000,
		desiredSampRate: 48000,
		bufferSize: 16384,
	};

    function toggleRecording( override ) {
		var wasRecording = isRecording;
		if( typeof override === 'boolean' ) {
			isRecording = override;
			isPaused = false;
		}
		else {
			isRecording = !isRecording;
		}
		// turn of recording if overview is shown or screen is black
		isRecording = ( isRecording && !deck.isOverview() && !deck.isPaused() );

		if ( !wasRecording && isRecording ) {
			start();
		}
		else if ( wasRecording && !isRecording) {
			stop();
		}
    }

    function start() {
		window.onbeforeunload = confirmExit;
		function confirmExit()
		{
				return "You have attempted to leave this page. All unsaved audio recordings will be lost. Are you sure you want to exit this page?";
		}

		deck.isRecording = true;

		indices = deck.getIndices();

		// determine audio element for slide
		var id = "audioplayer-" + indices.h + "." + indices.v;
		if ( indices.f != undefined && indices.f >= 0 ) id = id + "." + indices.f;
		recordedAudio = document.getElementById( id );
		if ( !recordedAudio ) {
			alert("Audio player is not found. Please check that audio-slideshow plugin is loaded!");
		}

		if ( !audioStream || !recordRTC ) {
			navigator.mediaDevices.getUserMedia({
				video: false,
				audio: { echoCancellation:true } // suggested by https://github.com/muaz-khan/RecordRTC
			}).then(async function(stream) {
				if ( window.IsChrome ) stream = new window.MediaStream( stream.getAudioTracks() );
				audioStream = stream;
				recordRTC = RecordRTC( stream, { type: 'audio' }, recordRTCConfig );
				recordRTC.startRecording();
				// Draw red circle over auto slide control
				var context = canvas.getContext( '2d' );
				context.beginPath();
				context.arc( ( canvas.width / 2 ), ( canvas.height / 2 ), ( canvas.width / 2 ) - 3, 0, Math.PI * 2, false );
				context.lineWidth = 3;
				context.fillStyle = '#f00';
				context.fill();
				context.strokeStyle = '#f00';
				context.stroke();
				// Let others know recording has started
				document.dispatchEvent( new CustomEvent('startrecording') );
			})
			.catch(function( error ) {
				alert( 'Something went wrong in accessing the microphone. (error code ' + error.code + ')' );
			});
		}
		else {
	//		audio.src = URL.createObjectURL( audioStream ); // deprecated since FF54
			audio.srcObject = audioStream;
			audio.volume = 0.0;
			recordRTC.startRecording();
			// Draw red circle over auto slide control
			var context = canvas.getContext( '2d' );
			context.beginPath();
			context.arc( ( canvas.width / 2 ), ( canvas.height / 2 ), ( canvas.width / 2 ) - 3, 0, Math.PI * 2, false );
			context.lineWidth = 3;
			context.fillStyle = '#f00';
			context.fill();
			context.strokeStyle = '#f00';
			context.stroke();
			// Let others know recording has started
			document.dispatchEvent( new CustomEvent('startrecording') );
		}
    }

    function stop() {
		deck.isRecording = false;
		audio.src = '';
		if ( recordRTC ) {

			let filename = indices.h + '.' + indices.v;
			if ( ( typeof indices.f != 'undefined' && indices.f >= 0) ) filename = filename + '.' + indices.f;

			recordRTC.stopRecording( function( url ) {
				// add audio URL to slide
				recordedAudio.src = url;

				// add audio to zip
				var blob = recordRTC.getBlob();

				filename = filename + '.' + blob.type.split( '/' ).pop();
				var reader = new window.FileReader();
				reader.readAsBinaryString(blob);
				reader.onloadend = function() {
					const blobBinaryString = reader.result;
					zip.file( filename, blobBinaryString, { binary: true } );
					filename = null;
				}
			} );
			indices = null;

		}

		// Remove red circle over auto slide control
		var context = canvas.getContext( '2d' );
		context.clearRect ( 0 , 0 , canvas.width , canvas.height );
		// Let others know recording has stopped
		document.dispatchEvent( new CustomEvent('stoprecording') );
	}

	function next() {
		// Remove red or yellow circle
		var context = canvas.getContext( '2d' );
		context.clearRect ( 0 , 0 , canvas.width , canvas.height );

		audio.src = '';

		if ( recordRTC ) {
			filename = indices.h + '.' + indices.v;
			if ( ( typeof indices.f != 'undefined' && indices.f >= 0) ) {
				filename = filename + '.' + indices.f;
			}
			recordRTC.stopRecording( function( url ) {
				// add audio URL to slide
				recordedAudio.src = url;
				// add audio to zip
				var blob = recordRTC.getBlob();

				filename = filename + '.' + blob.type.split( '/' ).pop();
				var reader = new window.FileReader();
				reader.readAsBinaryString(blob);
				reader.onloadend = function() {
					blobBinaryString = reader.result;
					zip.file( filename, blobBinaryString, { binary: true } );
					filename = null;
					if ( !isPaused ) start( deck );
				}
			} );
		}

		if ( isPaused ) {
			// Draw yellow circle over auto slide control
			var context = canvas.getContext( '2d' );
			context.beginPath();
			context.arc( ( canvas.width / 2 ), ( canvas.height / 2 ), ( canvas.width / 2 ) - 3, 0, Math.PI * 2, false );
			context.lineWidth = 3;
			context.fillStyle = '#ff0';
			context.fill();
			context.strokeStyle = '#ff0';
			context.stroke();
		}
	}

    function downloadZip() {
		let a = document.createElement('a');
		document.body.appendChild(a);
		try {
			a.download = "audio.zip";
			zip.generateAsync({type:"blob"})
			.then(function (content) {
				a.href = window.URL.createObjectURL( content );
				a.click();
				document.body.removeChild(a);
			});
		} catch( error ) {
			a.innerHTML += " (" + error + ")";
		}	
	}

    function fetchTTS() {

		function fetchAudio( audioSources ) {
			if ( audioSources.length ) {
				// take first audio from array
				let audioSource = audioSources.shift();
				let progress = Math.round(100 * ( progressBar.getAttribute( 'data-max' ) - audioSources.length ) / progressBar.getAttribute( 'data-max' ) );
				progressBar.setAttribute( 'style', "width: " + progress + "%" );
				let filename = audioSource.getAttribute('data-tts');
				let xhr = new XMLHttpRequest();
				xhr.open('GET', audioSource.src, true);
				xhr.responseType = 'blob';
				xhr.onload = function() {
					if (xhr.readyState === 4 && xhr.status === 200) {
							var blobURL = window.URL.createObjectURL(xhr.response);
						filename += '.' + xhr.response.type.split( '/' ).pop().split( 'x-' ).pop();
							// convert blob to binary string
						var reader = new window.FileReader();
						reader.readAsBinaryString(xhr.response);
						reader.onloadend = function() {
							blobBinaryString = reader.result;
							// add blob to zip
							zip.file( filename, blobBinaryString, { binary: true } );
							// fetch next audio file
							fetchAudio( audioSources );
						}
					}
				}
				xhr.onerror = function() {
					alert ( "Unable to fetch TTS-files!" );
					// remove progress bar
					document.querySelector( ".reveal" ).removeChild( progressContainer );
				}
				try {
					xhr.send(null); // fetch TTS
					console.log("Fetch TTS for slide " + audioSource.getAttribute('data-tts'));
				} catch ( error ) {
					alert ( "Unable to fetch TTS-files! " + error );
					// remove progress bar
					document.querySelector( ".reveal" ).removeChild( progressContainer );
				}
			}
			else {
				// generate zip for download
				zip.generateAsync({type:"blob"})
				.then(function (content) {
					var a = document.createElement('a');
					document.body.appendChild(a);
					try {
						a.download = "audio.zip";
						a.href = window.URL.createObjectURL( content );
					} catch( error ) {
						a.innerHTML += " (" + error + ")";
					}
					a.click();
					document.body.removeChild(a);
					// remove progress bar
					document.querySelector( ".reveal" ).removeChild( progressContainer );
				});
			}
		}

		const TTS = document.querySelectorAll('audio>source[data-tts]');
		if ( TTS.length ) {
			// show progress bar
			let progressContainer =  document.createElement( 'div' );
			progressContainer.className = "progress";
			progressContainer.setAttribute( 'style', "display: block; top: 0; bottom: auto; height: 12px;" );
			let progressBar =  document.createElement( 'span' );
			progressBar.setAttribute( 'style', "width: 0%;" );
			progressBar.setAttribute( 'data-max', TTS.length );
			progressContainer.appendChild( progressBar );
			document.querySelector( ".reveal" ).appendChild( progressContainer );

			fetchAudio( Array.prototype.slice.call(TTS) );
		}
		else {
			alert("Either there is no audio to fetch from the text to speech generator or all audio files are already provided.");
		}
    } // fetchTTS

	return {

		id: 'RevealAudioRecorder',

		init: function(reveal) {
			
			// do not activate in speaker notes view (popup)
			if (window.opener || !window.menubar.visible) {
				return;
			}

			// init variables
			deck = reveal;
			audio.autoplay = true;

			// set parameters
			var config = deck.getConfig().audio;
			if ( config ) {
				if ( config.mimeType != null ) recordRTCConfig.mimeType = config.mimeType;
				if ( config.audioBitsPerSecond != null ) recordRTCConfig.audioBitsPerSecond = config.audioBitsPerSecond;
				if ( config.sampleRate != null ) recordRTCConfig.sampleRate = config.sampleRate;
				if ( config.desiredSampRate != null ) recordRTCConfig.desiredSampRate = config.desiredSampRate;
				if ( config.bufferSize != null ) recordRTCConfig.bufferSize = config.bufferSize;
				if ( config.numberOfAudioChannels != null ) recordRTCConfig.numberOfAudioChannels = config.numberOfAudioChannels;
			}

			// keybindings
			deck.addKeyBinding( { keyCode: 82, key: 'R', description: 'Toggle recording' }, function() { 
				toggleRecording(); 
			} );
			deck.addKeyBinding( { keyCode: 90, key: 'Z', description: 'Download recordings' }, function() { 
				downloadZip(); 
			} );
			deck.addKeyBinding( { keyCode: 84, key: 'T', description: 'Fetch Text-to-speech audio files' }, function() { 
				fetchTTS(); 
			} );

			deck.addEventListener( 'fragmentshown', () => {
				if (isRecording) {
					if (recordedAudioExists(deck.getIndices())) {
						isPaused = true;
						next();
					}
					else if (isPaused) {
						// resume recording
						isPaused = false;
						start();
					}
					else {
						next();
					}
				}
			} );

			deck.addEventListener( 'fragmenthidden', () => {
				if (isRecording) {
					if (recordedAudioExists(deck.getIndices())) {
						isPaused = true;
						next();
					}
					else if (isPaused) {
						// resume recording
						isPaused = false;
						start();
					}
					else {
						next();
					}
				}
			} );
			deck.addEventListener( 'overviewshown', () => {
				toggleRecording(false);
			} );

			deck.addEventListener( 'paused',() => {
				toggleRecording(false);
			} );

			deck.addEventListener( 'ready',() => {
				// Create canvas on which red circle can be drawn
				canvas = document.createElement( 'canvas' );
				canvas.className = 'recorder';
				canvas.setAttribute( 'style', "position: fixed; top: 25px; right: 50px;" );
				canvas.width = 25;
				canvas.height = 25;
				document.querySelector( '.reveal' ).appendChild( canvas );
			} );

			deck.addEventListener( 'slidechanged',() => {
				if ( isRecording ) {
					if ( recordedAudioExists( deck.getIndices() ) ) {
						isPaused = true;
						next();
					}
					else if ( isPaused ) {
						// resume recording
						isPaused = false;
						start();
					}
					else {
						next();
					}
				}
			} );

			function recordedAudioExists( indices ) {
				var id = "audioplayer-" + indices.h + "." + indices.v;
				if ( indices.f != undefined && indices.f >= 0 ) id = id + "." + indices.f;
				return ( document.getElementById( id ).src.substring(0,4) == "blob");
			}
		}
	}
};

export default Plugin;