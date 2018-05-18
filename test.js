// TODO: Can JavaScript get Netstream.info() properties like videoLossRate, droppedFrames, videoBytesPerSecond or Netstream.currentFPS?
// TODO: Verify web worker is being shutdown properly.

// BUG: Chrome displays play button for player initially and doesn't autoplay
// BUG: Intermittently getting 404 or 503 errors in Google console from speed test sites:
//      http://wakefield-streaming2.perfectomobile.com/fcs/ident2 404
//      https://wakefield-streaming2.perfectomobile.com/idle/1662909371/24 503
//      http://fra-sts.perfectomobile.com/fcs/ident2 404
//      http://gdl-sts.perfectomobile.com/fcs/ident2 404
//      http://uk-streaming2.perfectomobile.com/fcs/ident2 404
//      http://phx-sts-2.perfectomobile.com/fcs/ident2 404
//      https://syd-sts.perfectomobile.com/idle/1331459816/47 - 504
//      http://yyz-sts.perfectomobile.com/fcs/ident2 404
//      * They do not occur in Safari
// BUG: Streaming tests sometimes fail because video is still buffering. Should wait until it's playing (event?).
// BUG: Clicking Stop during a streaming test stops streaming but starts speed test over

// Global constants
const streamTypes = ['rtmp', 'rtmpt', 'rtmps'] // types of streams we'll be testing
const playbackDuration = 30000 // how long to run each video stream (30 seconds)
// const streamDelay = 1000; // how between starting stream and showing in player + how long between stream type switches
const rotatingPlane = '<div class="sk-rotating-plane"></div>' // cool CSS effect
const errorIcon = '<i class="fas fa-exclamation-triangle"></i>' // triangle
const thumbsUp = ' <i class="far fa-thumbs-up"></i>'
const thumbsDown = ' <i class="far fa-thumbs-down"></i>'
const meh = ' <i class="far fa-meh"></i>' // face with blank expression

// Global variables
let testResults = { // Retains results for easy download, uses -1 as unknown value
  connectionInfo: {},
  dataCenters: [
    {
      name: 'Boston',
      code: 'bos',
      streamer: 'wakefield-streaming2',
      latency: -1,
      jitter: -1,
      download: -1,
      rtmp: -1,
      rtmpt: -1,
      rtmps: -1
    },
    {
      name: 'Frankfurt',
      code: 'fra',
      streamer: 'fra-sts',
      latency: -1,
      jitter: -1,
      download: -1,
      rtmp: -1,
      rtmpt: -1,
      rtmps: -1
    },
    {
      name: 'Guadalajara',
      code: 'gdl',
      streamer: 'gdl-sts',
      latency: -1,
      jitter: -1,
      download: -1,
      rtmp: -1,
      rtmpt: -1,
      rtmps: -1
    },
    {
      name: 'London',
      code: 'lon',
      streamer: 'uk-streaming2',
      latency: -1,
      jitter: -1,
      download: -1,
      rtmp: -1,
      rtmpt: -1,
      rtmps: -1
    },
    {
      name: 'Phoenix',
      code: 'phx',
      streamer: 'phx-sts-2',
      latency: -1,
      jitter: -1,
      download: -1,
      rtmp: -1,
      rtmpt: -1,
      rtmps: -1
    },
    {
      name: 'Sydney',
      code: 'syd',
      streamer: 'syd-sts',
      latency: -1,
      jitter: -1,
      download: -1,
      rtmp: -1,
      rtmpt: -1,
      rtmps: -1
    },
    {
      name: 'Toronto',
      code: 'yyz',
      streamer: 'yyz-sts',
      latency: -1,
      jitter: -1,
      download: -1,
      rtmp: -1,
      rtmpt: -1,
      rtmps: -1
    }
  ]
}
let dataCenters = testResults.dataCenters // for easier reference / readability
let running = false // tracks state of Start/Stop button, set in #startStop click handler
let selectedDataCenter = 0 // index of the array element in dataCenters for current tests
let selectedStreamType = -1 // index of the array element in streamTypes for current test (increments at top of function so use -1)
let player // reference to JW Player 7 (initially set in DOM ready)
// let runTestsTrigger; // allows clearTimeout for runTests()
let speedTestWorker = null // reference to web worker running speed tests
let getTestUpdatesTrigger // enables canceling setInterval on speedTestWorker, exists during speed test only
let streamPID // process id for stream generated by PHP (used to stop stream)
let testNextStreamerTrigger = null // enables clear timeout on textNextStreamer()
let testTypeRunning = 'None' // possible values: None | Network | Streaming
let streamPlaying = false

// Asynchronous event chain
// click Start -> testNextDataCenter() -> speedTestComplete event -> startTestStream() -> testNextStreamer()

// JQuery event handlers

// Start/Stop button handler
$('#startStop').on('click', function () {
  running = !running // toggle
  // Visually alter start/stop button with FontAwesome classes, begin the test and log
  if (running) {
    // Log, change icon,
    $('#startStopIcon').removeClass('far fa-play-circle').addClass('far fa-stop-circle')
    testNextDataCenter()
    // testNextStreamerTrigger = setTimeout(testNextStreamer, 10);
  } else {
    stopAll(false)
  }
})

// Test where we left off (redo current data center if results are incomplete)
function testNextDataCenter () {
  if (selectedDataCenter < dataCenters.length) {
    // Run speed tests between user and data center (completion is indicated by a triggered event)
    updateStatus('Running ' + dataCenters[selectedDataCenter].name + ' network tests...');
    testTypeRunning = 'Network'
    speedTestWorker = new Worker('speedtest-worker.js')
    getTestUpdatesTrigger = setInterval(getTestUpdates, 100) // Invoke every 100ms - asks web worker for speed test status and tracks streaming buffering
    speedTestWorker.onmessage = speedTestMessageHandler // Writes speed test results to table cells
    speedTestWorker.postMessage('start {"test_order":"I_P_D", "url_dl": "https://' + dataCenters[selectedDataCenter].code + '-lqt.perfectomobile.com/garbage.php", "url_ul": "https://' + dataCenters[selectedDataCenter].code + '-lqt.perfectomobile.com/empty.php", "url_ping": "https://' + dataCenters[selectedDataCenter].code + '-lqt.perfectomobile.com/empty.php", "url_telemetry": "https://' + dataCenters[selectedDataCenter].code + '-lqt.perfectomobile.com/telemetry.php"} ')
    return true // still have more to test
  } else {
    updateStatus('Finished all tests.')
    selectedDataCenter = 0
    running = false
    $('#startStopIcon').removeClass('far fa-stop-circle').addClass('far fa-play-circle') // change icon back to play
    return false // we're done
  }
}

// Stop running tests but keep track of data center where we left off
function stopAll (done) {
  clearInterval(testNextStreamerTrigger)
  switch (testTypeRunning) {
    case 'Network':
      if(speedTestWorker) speedTestWorker.postMessage('abort')
      clearInterval(getTestUpdatesTrigger)
      speedTestWorker = null
      break
    case 'Streaming':
      stopStream()
      break
  }
  updateStatus(done ? 'All tests completed.' : 'All tests stopped.')
  testTypeRunning = 'None'
  running = false
  $('#startStopIcon').removeClass('far fa-stop-circle').addClass('far fa-play-circle')
}

// Every 100ms... for speed tests, tell web worker we want status
function getTestUpdates () {
  if (speedTestWorker) speedTestWorker.postMessage('status')
}

// Handle when speedTestMessageHandler() triggers custom jQuery event saying we're done with the speed test
$('body').on('speedTestComplete', function () {
  // console.log('Finished ' + dataCenters[selectedDataCenter].name  + ' network tests.');
  speedTestWorker = null
  testTypeRunning = 'None'
  clearInterval(getTestUpdatesTrigger)
  qualifySpeedTestResults()
  startTestStream() // next task in chain of asynchronous events
})

// Call PHP to start ffmpeg sending FLV to streamer and set state appropriately
function startTestStream () {
  $.get('https://support.perfecto.io/php/stream-controller.php?type=start&sts=' + dataCenters[selectedDataCenter].streamer).done(function (response) {
    updateStatus('Starting stream from ' + dataCenters[selectedDataCenter].name + '...')
    streamPID = response
    testTypeRunning = 'Streaming'
    // Show rotating squares while we start streaming tests
    const tableCellPrefix = '#' + dataCenters[selectedDataCenter].code
    $(tableCellPrefix + '-rtmp').html(rotatingPlane)
    $(tableCellPrefix + '-rtmpt').html(rotatingPlane)
    $(tableCellPrefix + '-rtmps').html(rotatingPlane)
    // console.log('Started stream from ' + dataCenters[selectedDataCenter].name + ' (' + streamPID + ')...');
    player.setConfig({autostart: true}) // can't do it earlier because stream didn't start
    testNextStreamer()
  })
}

function testNextStreamer () {
  // Move to next element in streamTypes array (why we started at -1 instead of 0)
  selectedStreamType++

  // Finished a streaming test and need to decide what to do next
  if (selectedStreamType > 0) {
    // Calculate the percentage of the stream where buffering did not occur using qoe
    let qoe = player.qoe().item.sums
    if (player.getState() === 'buffering') console.log('Still buffering - trying to play too early.')
    let quality = Math.round((1 - qoe.buffering / qoe.playing) * 100)
    console.log('getItemMeta', player.getItemMeta()) // getItemMeta() event returns bandwidth of the stream to user's computer (maybe use that?)
    console.log('qoe', qoe)
    let lastStreamTypeCompleted = selectedStreamType - 1 // readability
    dataCenters[selectedDataCenter][streamTypes[lastStreamTypeCompleted]] = quality
    player.stop()
    streamPlaying = false

    // Put last bufferingPercentage into appropriate cell and qualify
    let tableCell = '#' + dataCenters[selectedDataCenter].code + '-' + streamTypes[lastStreamTypeCompleted]
    $(tableCell).html(quality)
    qualifyResult(tableCell, 39, 45, false, '%')

    if (selectedStreamType === streamTypes.length) { // no more stream types to test
      selectedDataCenter++
      if (selectedDataCenter === dataCenters.length) {
        stopAll(true)
        return
      }

      // Otherwise, done with streaming tests until next data center test (called from stopStream())
      stopStream()
      return
    }
  }

  // Advance to the next playlist item (preloaded array) for the current data center and play
  let selectedPlayListItem = selectedDataCenter * streamTypes.length + selectedStreamType
  player.playlistItem(selectedPlayListItem) // requires player.setConfig({autostart: true})
  console.log('Just called playlistItem(), about to call play()')
  player.play(true) // Chrome isn't doing anything
  streamPlaying = true
  updateStatus('Running ' + streamTypes[selectedStreamType].toUpperCase() + ' streaming test from ' + dataCenters[selectedDataCenter].name + '...')
  testNextStreamerTrigger = setTimeout(testNextStreamer, playbackDuration) // Call function again after video has played for playbackDuration
}

// Call PHP to kill ffmpeg process sending FLV to streamer
function stopStream () {
  $.get('https://support.perfecto.io/php/stream-controller.php?type=stop&pid=' + streamPID).done(function (response) {
    // console.log('Stopped stream ' + streamPID);
    player.stop()
    streamPlaying = false
    selectedStreamType = -1 // reset to first stream type
    testTypeRunning = 'None'
    clearTimeout(testNextStreamerTrigger)
    if (selectedDataCenter < dataCenters.length) testNextDataCenter() // Perhaps use setTimeout()
  })
}

// Handle messages sent by speedTestWorker
function speedTestMessageHandler (event) {
  // Format for returned event.data:
  // status;download;upload;latency (speeds are in mbit/s) (status: 0=not started, 1=downloading, 2=uploading, 3=latency, 4=done, 5=aborted)
  let data = event.data.split(';')
  if (data[0] === '4') { // We are done with network tests...
    $('body').trigger('speedTestComplete') // trigger custom event handler
  } else if ((data[0] >= 1) && (data[0] <= 3)) { // update the cell
    let tableCellPrefix = '#' + dataCenters[selectedDataCenter].code
    $(tableCellPrefix + '-download').html(data[1])
    dataCenters[selectedDataCenter].download = parseFloat(data[1])
    $(tableCellPrefix + '-latency').html(data[3])
    dataCenters[selectedDataCenter].latency = parseFloat(data[3])
    $(tableCellPrefix + '-jitter').html(data[5])
    dataCenters[selectedDataCenter].jitter = parseFloat(data[5])
  };
}

// Qualify whether the results are good, bad, meh, or error
function qualifyResult (id, bad, fair, greater, suffix) {
  let tableCell = $(id)
  let value = parseFloat(tableCell.html())
  if (value === -1) {
    tableCell.html(errorIcon)
  } else if (greater) {
    if (value > bad) {
      tableCell.html(value + suffix + thumbsDown)
    } else if (value > fair) {
      tableCell.html(value + suffix + meh)
    } else {
      tableCell.html(value + suffix + thumbsUp)
    }
  } else {
    if (value < bad) {
      tableCell.html(value + suffix + thumbsDown)
    } else if (value < fair) {
      tableCell.html(value + suffix + meh)
    } else {
      tableCell.html(value + suffix + thumbsUp)
    }
  }
}

// Rate quality for completed network tests
function qualifySpeedTestResults () {
  let tableCellPrefix = '#' + dataCenters[selectedDataCenter].code
  qualifyResult(tableCellPrefix + '-download', 0.5, 0.75, false, '')
  qualifyResult(tableCellPrefix + '-latency', 300, 150, true, '')
  qualifyResult(tableCellPrefix + '-jitter', 100, 50, true, '')
}

$('#download').on('click', function () {
  let dataToDownload = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(testResults))
  downloadButton = $('#download')
  downloadButton.attr('href', dataToDownload)
  downloadButton.attr('download', 'Perfecto Connectivity Test Results.json')
})

// DOM ready handler
$(document).ready(function () {
  // Detect client's networking and populate fields
  $.getJSON('https://support.perfecto.io/php/ip-info.php', function (response) {
    // loop through returned attributes and write to fields with matching id
    for (let attribute in response) {
      $('#' + attribute).val(response[attribute])
    }
    // Save to test results
    testResults.connectionInfo = response
  })

  // Initialize the media player with sample video (required to initialize jwplayer)
  player = jwplayer('player').setup({ // Use JSON format because jwplayer docs recommend it
    'key': 'pAFx+xZh2QbZIfGG2QUSVdDSasRktc53eglFxQ854CpEKdIp',
    // 'autostart': true, // can't enable this yet because the stream isn't live
    'primary': 'flash',
    'width': 383, // native: 1126
    'height': 829, // native: 2436
    'controls': false,
    'preload': 'none',
    'file': 'rtmp://wakefield-streaming2.perfectomobile.com/live/conTest', // placeholder to allow setup to work
    'image': 'phone.jpg',
    'logo': {
      'file': 'favicon-32x32.png'
    },
    'events': {
      onBufferChange: function (obj) {},
      onFirstFrame: function (obj) {}
    },
    'rtmp': {
      'bufferLength': 0
    }
  })
  player.load(generatePlayList())

  if (!player.utils.isFlashSupported()) alert('Flash is required for the streaming tests (though the speed test will still run). Please enable Flash for https://support.perfecto.io.')

  // Handle streaming error
  player.on('error', function (e) {
    console.log('JW Player Error', e)
    streamPlaying = false
    let tableCell = '#' + dataCenters[selectedDataCenter].code + '-' + streamTypes[selectedStreamType]
    $(tableCell).html(errorIcon)
    updateStatus(streamTypes[selectedStreamType].toUpperCase() + ' test from ' + dataCenters[selectedDataCenter].name + ' failed!')
    clearTimeout(testNextStreamerTrigger)
    testNextStreamer()
  })

  player.on('firstFrame', function () {
    let qoe = this.qoe()
    console.log('Player took ' + JSON.stringify(qoe.firstFrame) + 'ms to get to the first frame of video.')
  })
})

// Generates array for jwplayer based for each dataCenter and streamType
function generatePlayList () {
  let playList = []
  for (let dataCenter in dataCenters) {
    for (let streamType in streamTypes) {
      playList.push({
        file: streamTypes[streamType] + '://' + dataCenters[dataCenter].streamer + '.perfectomobile.com/live/conTest',
        image: 'phone.jpg',
        title: dataCenters[dataCenter].name + ' (' + streamTypes[streamType].toUpperCase() + ')'
      })
    }
  }
  return playList
}

// Write status near Start/Stop button and console log
function updateStatus (message) {
  $('#status').html(message)
  console.log(message)
}