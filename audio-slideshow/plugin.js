/*****************************************************************
** Authors: Asvin Goel, goel@telematique.eu
**		    Ryan Kelln, ryankelln.com
**
** A plugin for reveal.js allowing to  automatically play audio
** files for a slide deck. After an audio file has completed
** playing the next slide or fragment is automatically shown and
** the respective audio file is played. If no audio file is
** available, a blank audio file with default  duration is played
** instead.
**
** Version: 1.1
**
** License: MIT license (see LICENSE.md)
**
******************************************************************/

import Recorder from './recorder.js';
import { createSilentAudio } from 'create-silent-audio';

const RevealAudioSlideshow = {
    id: 'RevealAudioSlideshow',
    init: function(reveal) {
        initAudioSlideshow(reveal);
    }
};

export default RevealAudioSlideshow;

const initAudioSlideshow = function(reveal){
	// do not activate in speaker notes view (popup)
	if (window.opener || !window.menubar.visible) {
		return;
	}

	// default parameters
	var prefix = "audio/";
	var suffix = ".ogg";
	var textToSpeechURL = null; // no text to speech converter
//	var textToSpeechURL = "http://api.voicerss.org/?key=[YOUR_KEY]&hl=en-gb&c=ogg&src="; // the text to speech converter
	var defaultNotes = false; // use slide notes as default for the text to speech converter
	var defaultText = false; // use slide text as default for the text to speech converter
	var defaultDuration = 5; // value in seconds
	var defaultAudios = true; // try to obtain audio for slide and fragment numbers
	var advance = 0; // advance to next slide after given time in milliseconds after audio has played, use negative value to not advance
	var autoplay = false; // automatically start slideshow
	var playerOpacity = .05; // opacity when the mouse is far from to the audioplayer
	var startAtFragment = false; // when moving to a slide, start at the current fragment or at the start of the slide
	var playerStyle = "position: fixed; bottom: 4px; left: 25%; width: 50%; height:75px; z-index: 33;"; // style used for container of audio controls
	// ------------------

	var silence;
	var currentAudio = null;
	var previousAudio = null;
	var timer = null;
	var initialized = false;

	reveal.addEventListener( 'fragmentshown', function( event ) {
		if ( timer ) { clearTimeout( timer ); timer = null; }
		//console.debug( "fragmentshown ");
		selectAudio();
	} );

	reveal.addEventListener( 'fragmenthidden', function( event ) {
		if ( timer ) { clearTimeout( timer ); timer = null; }
		//console.debug( "fragmenthidden ");
		selectAudio();
	} );

	reveal.addEventListener( 'ready', function( event ) {
		setup();
		//console.debug( "AudioSlideshow ready");
		handleNewSlide(event.currentSlide);
		//document.dispatchEvent( new CustomEvent('stopplayback') );

	} );

	function handleNewSlide(slide) {
		if (!initialized) return;
		if ( timer ) { clearTimeout( timer ); timer = null; }
		//console.debug( "AudioSlideshow handleNewSlide ", slide);

		// hide fragments when slide is shown if needed
		const indices = reveal.getIndices();
		if ( !startAtFragment && typeof indices.f !== 'undefined' && indices.f >= 0) {
			reveal.slide(indices.h, indices.v, -1);
		}

		// update background videos
		let video = slide.slideBackgroundContentElement.querySelector('video');
		linkVideoToAudioControls(getAudioPlayer(indices), video);

		selectAudio(); // important that this comes after updating background videos
	}

	reveal.addEventListener( 'slidechanged', function( event ) {
		handleNewSlide(event.currentSlide);
	} );

	reveal.addEventListener( 'paused', function( event ) {
		if ( timer ) { clearTimeout( timer ); timer = null; }
		if ( currentAudio ) { currentAudio.pause(); }
	} );

	reveal.addEventListener( 'resumed', function( event ) {
		if ( timer ) { clearTimeout( timer ); timer = null; }
	} );

	reveal.addEventListener( 'overviewshown', function( event ) {
		if ( timer ) { clearTimeout( timer ); timer = null; }
		if ( currentAudio ) { currentAudio.pause(); }
		document.querySelector(".audio-controls").style.visibility = "hidden";
	} );

	reveal.addEventListener( 'overviewhidden', function( event ) {
		if ( timer ) { clearTimeout( timer ); timer = null; }
		document.querySelector(".audio-controls").style.visibility = "visible";
	} );

	reveal.addKeyBinding( { keyCode: 65, key: 'A', description: 'Toggle audio' }, function() {
		if ( currentAudio ) {
			if ( timer ) { clearTimeout( timer ); timer = null; }
			currentAudio.paused ? currentAudio.play() : currentAudio.pause();
		}
	} );

	function getAudioPlayer(indices = null) {
		if (indices == null) {
			indices = reveal.getIndices();
		}
		let id = "audioplayer-" + indices.h + '.' + indices.v;
		if ( indices.f != undefined && indices.f >= 0 ) id = id + '.' + indices.f;
		return document.getElementById( id );
	}

	// returns currentAudio or null
	function selectAudio() {
		//console.debug("AudioSlideshow selectAudio", previousAudio, currentAudio);
		if ( currentAudio ) {
			previousAudio = currentAudio;
			if (!previousAudio.ended) {
				//console.log("selectAudio pause on end", previousAudio.id);
				previousAudio.pause();
				if ( timer ) { clearTimeout( timer ); timer = null; }
			}
			previousAudio.currentTime = 0; // reset to start
			previousAudio.style.display = "none";
		}
		currentAudio = getAudioPlayer();
		if ( currentAudio ) {
			currentAudio.style.display = "block";
			if ( previousAudio && currentAudio.id != previousAudio.id) {
				currentAudio.volume = previousAudio.volume;
				currentAudio.muted = previousAudio.muted;
			}
			if ( autoplay ) {
				//console.debug( "Play " + currentAudio.id, currentAudio);
				currentAudio.play();
			}
			return currentAudio;
		}
		console.warn("No currentAudio")
		return null;
	}


	function setup() {
		if (initialized) return;

		// wait for markdown and highlight plugin to be done
		if (
			document.querySelector( 'section[data-markdown]:not([data-markdown-parsed])' ) 
			|| document.querySelector( 'code[data-line-numbers*="|"]')
		) {
			setTimeout( setup, 100 );
			return;
		}

		initialized = true;

		// set parameters
		var config = reveal.getConfig().audio;
		if ( config ) {
			if ( config.prefix != null ) prefix = config.prefix;
			if ( config.suffix != null ) suffix = config.suffix;
			if ( config.textToSpeechURL != null ) textToSpeechURL = config.textToSpeechURL;
			if ( config.defaultNotes != null ) defaultNotes = config.defaultNotes;
			if ( config.defaultText != null ) defaultText = config.defaultText;
			if ( config.defaultDuration != null ) defaultDuration = config.defaultDuration;
			if ( config.defaultAudios != null ) defaultAudios = config.defaultAudios;
			if ( config.advance != null ) advance = config.advance;
			if ( config.autoplay != null ) autoplay = config.autoplay;
			if ( config.playerOpacity != null  ) playerOpacity = config.playerOpacity;
			if ( config.playerStyle != null ) playerStyle = config.playerStyle;
		}

		if ( 'ontouchstart' in window || navigator.msMaxTouchPoints ) {
			playerOpacity = 1;
		}
		if ( reveal.getConfig().audioStartAtFragment ) startAtFragment = reveal.getConfig().audioStartAtFragment;

		// set style so that audio controls are shown on hover
		let css = '.audio-controls>audio { opacity:' + playerOpacity + ';} .audio-controls:hover>audio { opacity:1;}';
		let style = document.createElement( 'style' );
		if ( style.styleSheet ) {
		    style.styleSheet.cssText=css;
		}
		else {
		    style.appendChild( document.createTextNode( css ) );
		}
		document.getElementsByTagName( 'head' )[0].appendChild( style );

		if ( defaultDuration > 0) {
			silence = createSilentAudio( defaultDuration ); // create the wave file
		}

		var divElement =  document.createElement( 'div' );
		divElement.className = "audio-controls";
		divElement.setAttribute( 'style', playerStyle );
		document.querySelector( ".reveal" ).appendChild( divElement );

		// preload all video elements that meta data becomes available as early as possible
		preloadVideoElements();

		// create audio players for all slides
		var horizontalSlides = document.querySelectorAll( '.reveal .slides>section' );
		for( var h = 0, len1 = horizontalSlides.length; h < len1; h++ ) {
			var verticalSlides = horizontalSlides[ h ].querySelectorAll( 'section' );
			if ( !verticalSlides.length ) {
				setupAllAudioElements( divElement, h, 0, horizontalSlides[ h ] );
			}
			else {
				for( var v = 0, len2 = verticalSlides.length; v < len2; v++ ) {
					setupAllAudioElements( divElement, h, v, verticalSlides[ v ] );
				}
			}
		}
	}

	function preloadVideoElements() {
		var videoElements = document.querySelectorAll( 'video[data-audio-controls]' );
		for( var i = 0; i < videoElements.length; i++ ) {
//console.warn(videoElements[i]);
			videoElements[i].load();
		}
	}

	function getText( textContainer ) {
		var elements = textContainer.querySelectorAll( '[data-audio-text]' ) ;
		for( var i = 0, len = elements.length; i < len; i++ ) {
			// replace all elements with data-audio-text by specified text
			textContainer.innerHTML = textContainer.innerHTML.replace(elements[i].outerHTML,elements[i].getAttribute('data-audio-text'));
		}
		return textContainer.textContent.trim().replace(/\s+/g, ' ');
	}

	function setupAllAudioElements( container, h, v, slide ) {
		if ( slide.querySelector( 'code.fragment:not([data-fragment-index])' ) ) {
			// somehow the timing when code fragments receive the fragment index is weird
			// this is a work around that shouldn't be necessary

			// create audio elements for slides with code fragments
			setupAudioElement( container, h + '.' + v, slide.getAttribute( 'data-audio-src' ), '', null  );
			fragments = slide.querySelectorAll( 'code.fragment' );
			for ( i = 0; i < fragments.length; i++ ) {
				setupAudioElement( container, h + '.' + v + '.' + i, null, '', null  );
			}
			return;
		}

		let textContainer =  document.createElement( 'div' );
		let text = null;
		let fragments = null;
		if ( !slide.hasAttribute( 'data-audio-src' ) ) {
			// determine text for TTS
			if ( slide.hasAttribute( 'data-audio-text' ) ) {
				text = slide.getAttribute( 'data-audio-text' );
			}
			else if ( defaultNotes && reveal.getSlideNotes( slide ) ) {
				// defaultNotes
				let div = document.createElement("div");
				div.innerHTML = reveal.getSlideNotes( slide );
				text = div.textContent || '';
			}
			else if ( defaultText ) {
				textContainer.innerHTML = slide.innerHTML;
				// remove fragments
				fragments = textContainer.querySelectorAll( '.fragment' ) ;
				for( let f = 0, len = fragments.length; f < len; f++ ) {
					textContainer.innerHTML = textContainer.innerHTML.replace(fragments[f].outerHTML,'');
				}
				text = getText( textContainer);
			}
// alert( h + '.' + v + ": " + text );
// console.log( h + '.' + v + ": " + text );
		}
		let video = slide.querySelector( ':not(.fragment) > video[data-audio-controls]' );
		let link_position = true; // whether the audio position controls the video position
		if (!video) {
			video = slide.slideBackgroundContentElement.querySelector('video');
			//console.debug("found background vid:", video, container, h, v, slide );
		}
		// if there are fragments on this slide then assume no audio / video linking
		if (slide.querySelector( '.fragment' )) {
			link_position = false;
		}
		setupAudioElement( container, h + '.' + v, slide.getAttribute( 'data-audio-src' ), text, video, link_position );
		let i = 0;
		while ( (fragments = slide.querySelectorAll( '.fragment[data-fragment-index="' + i +'"]' )).length > 0 ) {
			let audio = null;
			let text = '';
			link_position = false;
			for( let f = 0, len = fragments.length; f < len; f++ ) {
				audio = null;
				if ( !audio ) audio = fragments[ f ].getAttribute( 'data-audio-src' );
				if ( !video ) {
					video = fragments[ f ].querySelector( 'video[data-audio-controls]' );
					link_position = true;
				}
				// determine text for TTS
				if ( fragments[ f ].hasAttribute( 'data-audio-text' ) ) {
					text += fragments[ f ].getAttribute( 'data-audio-text' ) + ' ';
				}
				else if ( defaultText ) {
					textContainer.innerHTML = fragments[ f ].textContent;
					text += getText( textContainer );
				}
			}
//console.log( h + '.' + v + '.' + i  + ": >" + text +"<")
			setupAudioElement( container, h + '.' + v + '.' + i, audio, text, video, link_position );
 			i++;
		}
	}

	// try to sync video with audio controls
	// HACK: This is a hot mess, sorry. A proper solution would add a custom event in
	// revealjs when background video elements are finished preloading and added to 
	// DOM. For now this function can be called for both videos and background videos
	// in multiple times and places and thus tries to handle the different cases
	// as best it can. Which isn't very well.
	// Second, the source loading is a mess, since what we really want is to preload
	// the real audio every time not any fallback silence. It may be fast enough to
	// create silence only as needed and never add silent sources, but that is untested.
	// Currently the silent audio source elements are pretty extraneous, but I've left
	// them in for now.
	async function linkVideoToAudioControls( audioElement, videoElement, link_position = true ) {
		if (!audioElement || !videoElement) return;

		if (!videoElement.duration) {
			console.warn("Suspicious video duration:", videoElement, videoElement.duration);
			return;
		}

		let linked_video_src = audioElement.querySelector('source[data-linked-video]');
		//console.log("linked_video_src", linked_video_src, videoElement.currentSrc);
		if (linked_video_src && linked_video_src.dataset.linkedVideo == videoElement.currentSrc) {
			console.warn("already linked", audioElement.currentSrc, linked_video_src, videoElement.currentSrc);
			return;
		}
		//console.debug("linkVideoToAudioControls", audioElement, audioElement.currentSrc, videoElement.currentSrc);
		
		// set video link
		let audioSource = audioElement.querySelector('source');
		if (audioSource) {
			audioSource.setAttribute("data-linked-video", videoElement.currentSrc);

			// ensure non-silent audio doesn't loop (if it was set to silent previously)
			if (!audioSource.dataset.audioSilent) {
				audioElement.loop = false;
			}
		}

		audioElement.addEventListener( 'playing', function( event ) {
			//console.debug("AudioSlideshow playing event", audioElement.id);
			if (link_position) videoElement.currentTime = audioElement.currentTime;
			if ( videoElement.paused ) {
				videoElement.play();
			}
		} );
		audioElement.addEventListener( 'pause', function( event ) {
			if ( !videoElement.paused ) { 
				if (link_position) videoElement.currentTime = audioElement.currentTime;
				videoElement.pause();
			}
		} );
		audioElement.addEventListener( 'volumechange', function( event ) {
			videoElement.volume = audioElement.volume;
			videoElement.muted = audioElement.muted;
		} );
		audioElement.addEventListener( 'seeked', function( event ) {
			if (link_position) videoElement.currentTime = audioElement.currentTime;
		} );

		let target_duration = Math.round(videoElement.duration + .5);

		// if there is real audio, or silent audio matches video length, 
		// then we're OK but ensure the audio src is actually then one we want
		if (audioSource) {
			if (!audioSource.dataset.audioSilent || 
				audioSource.dataset.audioSilent == target_duration) {
				//console.debug("audio exists", audioSource, audioSource.src, videoElement.currentSrc);
				if (audioElement.currentSrc != audioSource.src) {
					//console.debug("hard link src");
					audioElement.src = audioSource.src;
				}
				return;
			}
		}
		//console.debug("link silent to video", audioElement, videoElement.currentSrc, videoElement.duration);
		
		// remove existing silent audio if it doesnt match duration
		audioSource = audioElement.querySelector('source[data-audio-silent]');
		if ( audioSource && audioSource.duration != target_duration) {
			//console.debug("remove old silent with bad duration", audioSource, audioSource.duration, target_duration );
			audioElement.removeChild( audioSource );
		}

		// add silent audio with video length, to be used as fallback if no audio
		audioSource = document.createElement( 'source' );
		if (!videoElement.duration || videoElement.duration > 600) {
			console.warn("Suspicious video duration for silent audio:", videoElement.duration);
		}
		audioSource.src = createSilentAudio( target_duration );
		audioSource.setAttribute("data-audio-silent", target_duration);
		audioElement.loop = videoElement.loop; // loop silence if video loops
		try {
			audioElement.appendChild(audioSource, audioElement.firstChild);
			audioElement.src = audioSource.src;
			await audioElement.load();
		} catch (err) {
			// can be interrupted
			//console.debug("src/load interrupted", err);
			audioElement.src = null;
			audioElement.removeChild(audioSource);
		}
	}

	function setupFallbackAudio( audioElement, text, videoElement ) {
		// default file cannot be read
		if ( textToSpeechURL != null && text != null && text != "" ) {
			var audioSource = document.createElement( 'source' );
			audioSource.src = textToSpeechURL + encodeURIComponent(text);
			audioSource.setAttribute('data-tts',audioElement.id.split( '-' ).pop());
			audioElement.appendChild(audioSource, audioElement.firstChild);
		}
		else {
	 		if ( !audioElement.querySelector('source[data-audio-silent]') ) {
				// create silent source if not yet existent
				if (silence != null) {
					let audioSource = document.createElement( 'source' );
					audioSource.src = silence;
					audioSource.setAttribute("data-audio-silent", defaultDuration);
					audioElement.appendChild(audioSource, audioElement.firstChild);
				}
			}
		}
	}

	function setupAudioElement( container, indices, audioFile, text, videoElement, link_postion = true ) {
		var audioElement = document.createElement( 'audio' );
		audioElement.setAttribute( 'style', "position: relative; top: 20px; left: 10%; width: 80%;" );
		audioElement.id = "audioplayer-" + indices;
		audioElement.style.display = "none";
		audioElement.setAttribute( 'controls', '' );
		audioElement.setAttribute( 'preload', 'none' );

		//console.debug("setupAudioElement", audioFile, videoElement);

		if ( videoElement ) {
			// connect play, pause, volumechange, mute, timeupdate events to video
			if ( videoElement.duration ) {
				linkVideoToAudioControls( audioElement, videoElement, link_postion );
			}
			else {
				//console.log("wait for meta from", videoElement);
				videoElement.addEventListener('loadedmetadata', (event) => {
					//console.log("GOT meta from", videoElement, event);
					linkVideoToAudioControls( audioElement, videoElement, link_postion );
				});
			}
		}

		audioElement.addEventListener( 'ended', function( event ) {
			//console.debug("ended", audioElement);
			if ( reveal.isRecording == 'undefined' || !reveal.isRecording ) {
				// determine whether and when slideshow advances with next slide
				let advanceNow = advance;
				let slide = reveal.getCurrentSlide();
				// check current fragment
				let indices = reveal.getIndices();
				if ( typeof indices.f !== 'undefined' && indices.f >= 0) {
					let fragment = slide.querySelector( '.fragment[data-fragment-index="' + indices.f + '"][data-audio-advance]' ) ;
					if ( fragment ) {
						advanceNow = + fragment.getAttribute( 'data-audio-advance' );
					}
				}
				else if ( slide.hasAttribute( 'data-audio-advance' ) ) {
					advanceNow = + slide.getAttribute( 'data-audio-advance' ); // + does int conversion
					if (!Number.isInteger(advanceNow)) {
						console.warn("data-audio-advance invalid", slide.getAttribute( 'data-audio-advance' ), slide);
					}
				}
				// advance immediately or set a timer - or do nothing
				if ( advance == "true" || advanceNow == 0 ) {
					let prev = currentAudio;
					reveal.next();
					//console.debug("advance immediate select audio", prev);
					//selectAudio( prev );
				}
				else if ( advanceNow > 0 ) {
					timer = setTimeout( function() {
						let prev = currentAudio;
						reveal.next();
						//console.debug('advance in', advanceNow,'select audio', prev);
						//selectAudio( prev );
						timer = null;
					}, advanceNow );
				}
			}
		} );
		audioElement.addEventListener( 'play', function( event ) {
			var evt = new CustomEvent('startplayback', {
				detail: {
					resume: audioElement.currentTime > 0 && !audioElement.ended,
					id: audioElement.id
				}
			});
			evt.timestamp = 1000 * audioElement.currentTime;
			document.dispatchEvent( evt );

			if ( timer ) { clearTimeout( timer ); timer = null; }
			// preload next audio element so that it is available after slide change
			var indices = reveal.getIndices();
			var nextId = "audioplayer-" + indices.h + '.' + indices.v;
			if ( indices.f != undefined && indices.f >= 0 ) {
				nextId = nextId + '.' + (indices.f + 1);
			}
			else {
				nextId = nextId + '.0';
			}
			var nextAudio = document.getElementById( nextId );
			if ( !nextAudio ) {
				nextId = "audioplayer-" + indices.h + '.' + (indices.v+1);
				nextAudio = document.getElementById( nextId );
				if ( !nextAudio ) {
					nextId = "audioplayer-" + (indices.h+1) + '.0';
					nextAudio = document.getElementById( nextId );
				}
			}
			if ( nextAudio ) {
				//console.debug( "Preload: " + nextAudio.id );
				// FIXME: set up audio for videos here so loading works better
				nextAudio.load();
			}
		} );
		audioElement.addEventListener( 'pause', function( event ) {
			if ( timer ) { clearTimeout( timer ); timer = null; }
			let evt = new CustomEvent('stopplayback', {
				detail: {
					// if we are not at start or end then send pause signal
					pause: audioElement.currentTime > 0 && !audioElement.ended,
					id: audioElement.id
				}
			});
			document.dispatchEvent( evt );
		} );
		audioElement.addEventListener( 'seeked', function( event ) {
			let evt = new CustomEvent('seekplayback');
			evt.timestamp = 1000 * audioElement.currentTime;
			document.dispatchEvent( evt );
			if ( timer ) { clearTimeout( timer ); timer = null; }
		} );

		if ( audioFile != null ) {
			// Support comma separated lists of audio sources
			audioFile.split( ',' ).forEach( function( source ) {
				var audioSource = document.createElement( 'source' );
				audioSource.src = source;
				audioElement.insertBefore(audioSource, audioElement.firstChild);
			} );
		}
		else if ( defaultAudios ) {
			var audioExists = false;
			try {
				// check if audio file exists
				var xhr = new XMLHttpRequest();
				xhr.open('HEAD', prefix + indices + suffix, true);
	 			xhr.onload = function() {
	   				if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
						var audioSource = document.createElement( 'source' );
						audioSource.src = prefix + indices + suffix;
						audioElement.insertBefore(audioSource, audioElement.firstChild);
						audioExists = true;
					}
					else {
						setupFallbackAudio( audioElement, text, videoElement );
					}
				}
				xhr.send(null);
			} catch( error ) {
//console.log("Error checking audio" + audioExists);
				// fallback if checking of audio file fails (e.g. when running the slideshow locally)
				var audioSource = document.createElement( 'source' );
				audioSource.src = prefix + indices + suffix;
				audioElement.insertBefore(audioSource, audioElement.firstChild);
				setupFallbackAudio( audioElement, text, videoElement );
			}
		} else if (!videoElement) {
			//console.log(" extra fallback for ", audioElement, videoElement);
			setupFallbackAudio( audioElement, text, videoElement );
		}
		if ( audioFile != null || defaultDuration > 0 ) {
			container.appendChild( audioElement );
		}
	}
};
