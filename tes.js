import { useEffect, useState } from "react";
import "./App.css";
import AgoraRTC, {
  AgoraVideoPlayer,
  createClient,
  createMicrophoneAndCameraTracks,
} from "agora-rtc-react";
import Chat from "./components/Chat";
import AgoraRTM from "agora-rtm-sdk";

const APP_ID = process.env.REACT_APP_ID;

const config = { mode: "rtc", codec: "vp8", appId: APP_ID };
const appId = config.appId;
console.info("appId", appId);
const token = process.env.REACT_APP_TOKEN || null;

const useClient = createClient(config);
const useMicrophoneAndCameraTracks = createMicrophoneAndCameraTracks();

const VideoCall = (props) => {
  const { setInCall, channelName, userName } = props;
  const [users, setUsers] = useState([]);
  const [userNames, setUserNames] = useState({});
  const [start, setStart] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const client = useClient();
  const { ready, tracks } = useMicrophoneAndCameraTracks();
  const [localTracks, setLocalTracks] = useState([]); // [localAudioTrack, localVideoTrack | screenShareTrack]
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [rtmClient, setRtmClient] = useState(null); // for chat
  const [rtmChannel, setRtmChannel] = useState(null);

  useEffect(() => {
    // function to initialise the SDK
    let init = async (chName) => {
      client.on("user-published", async (user, mediaType) => {
        console.info("user-published", user, mediaType);
        await client.subscribe(user, mediaType);
        console.log("subscribe success");
        if (mediaType === "video") {
          setUsers((prevUsers) => {
            return [...prevUsers, user];
          });

          // Add user's name to the userNames state
          setUserNames((prevUserNames) => ({
            ...prevUserNames,
            [user.uid]: userName,
          }));
        }
        if (mediaType === "audio") {
          user.audioTrack?.play();
        }
      });

      client.on("user-unpublished", (user, type) => {
        console.log("unpublished", user, type);
        if (type === "audio") {
          user.audioTrack?.stop();
        }
        if (type === "video") {
          setUsers((prevUsers) => {
            return prevUsers.filter((User) => User.uid !== user.uid);
          });
        }
      });

      client.on("user-left", (user) => {
        console.log("leaving", user);
        setUsers((prevUsers) => {
          return prevUsers.filter((User) => User.uid !== user.uid);
        });
      });

      await client.join(appId, chName, token, null);

      if (tracks) {
        await client.publish([tracks[0], tracks[1]]);
        setLocalTracks([tracks[0], tracks[1]]);
      }
      setStart(true);
    };

    if (ready && tracks) {
      console.log("init ready");
      init(channelName);
    }

    // Clean up function
    return () => {
      // Leave the channel and remove all listeners
      client.leave();
      client.removeAllListeners();
      if (rtmClient) {
        rtmClient.logout();
        rtmClient.removeAllListeners();
      }
    };
  }, [channelName, client, ready, tracks]);

  useEffect(() => {
    // Initialize RTM client when video call starts
    if (start) {
      initializeRTM();
    }
  }, [start]);

  const initializeRTM = async () => {
    const uid = client.uid; // Use the same uid as the video client

    // Create an RTM client instance
    const rtmClient = AgoraRTM.createInstance(appId);

    // Login to RTM using the same uid
    await rtmClient.login({ uid: String(uid) });

    const rtmChannel = rtmClient.createChannel(channelName);
    await rtmChannel.join();
    setRtmChannel(rtmChannel);

    // Set event listeners for incoming messages
    rtmChannel.on("ChannelMessage", (message, memberId) =>
      handleRTMMessage(message, memberId, rtmChannel)
    );

    const introMessage = {
      text: `${userName} has joined the meeting!`,
      sender: userName,
    };
    await rtmChannel.sendMessage({ text: introMessage.text });

    await rtmChannel.sendMessage({ text: "RequestNames" });

    setRtmClient(rtmClient);
  };

  const handleRTMMessage = async (message, memberId, channel) => {
    // Update chatMessages state with the incoming message

    if (message.text) {
      // if it's an introduction message
      if (message.text.includes("has joined the meeting!")) {
        const newUser = message.text.split("has joined the")[0].trim();
        if (userNames[memberId]) return;
        setUserNames((prevUserNames) => ({
          ...prevUserNames,
          [memberId]: newUser,
        }));
      }
      // if new user has requested names
      if (message.text === "RequestNames") {
        await channel?.sendMessage({ text: `GetUserName ${userName}` });
        return;
      }
      // if existing user has sent their name
      if (message.text.includes("GetUserName")) {
        const newUser = message.text.split("GetUserName")[1].trim();
        if (userNames[memberId]) return;
        setUserNames((prevUserNames) => ({
          ...prevUserNames,
          [memberId]: newUser,
        }));

        return;
      }

      setChatMessages((prevMessages) => [
        ...prevMessages,
        { text: message.text, sender: memberId },
      ]);
    }
  };

  const sendRTMMessage = async (message) => {
    // Send a message to the RTM channel
    try {
      if (!rtmChannel) return false;

      await rtmChannel.sendMessage({ text: message });
      return true;
    } catch (error) {
      console.error("Error sending RTM message:", error);
      return false;
    }
  };

  const toggleScreenShare = async () => {
    if (!screenShareEnabled) {
      try {
        await client.unpublish(localTracks[1]);

        const screenTrack = await AgoraRTC.createScreenVideoTrack();
        if (screenTrack) {
          await client.publish(screenTrack);
          setLocalTracks([localTracks[0], screenTrack]); // replace video track with screen track
          setScreenShareEnabled(true);
        } else {
          console.info("screenTrack is not a local track", screenTrack);
        }
      } catch (error) {
        console.error("Error while starting screen sharing:", error);
      }
    } else {
      try {
        await client.unpublish(localTracks[1]);

        await client.publish(tracks[1]);
        setLocalTracks([localTracks[0], tracks[1]]); // replace screen track with video track

        setScreenShareEnabled(false);
      } catch (error) {
        console.error("Error while stopping screen sharing:", error);
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
      }}
    >
      <div className="App">
        {ready && tracks && (
          <Controls
            tracks={localTracks}
            setStart={setStart}
            setInCall={setInCall}
            toggleScreenShare={toggleScreenShare}
            screenShareEnabled={screenShareEnabled}
          />
        )}
        {start && tracks && (
          <Videos
            users={users}
            tracks={localTracks}
            screenShareEnabled={screenShareEnabled}
          />
        )}
      </div>
      {start && rtmClient && (
        <Chat
          chatMessages={chatMessages}
          sendRTMMessage={sendRTMMessage}
          setChatMessages={setChatMessages}
          userName={userName}
          userNames={userNames}
        />
      )}
    </div>
  );
};

const Videos = (props) => {
  const { users, tracks } = props;

  return (
    <div>
      <div id="videos">
        <AgoraVideoPlayer
          style={{ height: "95%", width: "95%" }}
          className="vid"
          videoTrack={tracks[1]}
        />
        {users.length > 0 &&
          users.map((user) => {
            if (user.videoTrack) {
              return (
                <AgoraVideoPlayer
                  style={{ height: "95%", width: "95%" }}
                  className="vid"
                  videoTrack={user.videoTrack}
                  key={user.uid}
                />
              );
            } else return null;
          })}
      </div>
    </div>
  );
};

export const Controls = (props) => {
  const client = useClient();
  const { tracks, setStart, setInCall, toggleScreenShare, screenShareEnabled } =
    props;
  const [trackState, setTrackState] = useState({ video: true, audio: true });

  useEffect(() => {
    console.info("muting ", trackState.audio, trackState.video);
  }, [trackState]);

  const mute = async (type) => {
    if (type === "audio") {
      await tracks[0].setEnabled(!trackState.audio);
      setTrackState((ps) => {
        return { ...ps, audio: !ps.audio };
      });
    } else if (type === "video") {
      await tracks[1].setEnabled(!trackState.video);
      setTrackState((ps) => {
        return { ...ps, video: !ps.video };
      });
    }
  };

  const leaveChannel = async () => {
    await client.leave();
    client.removeAllListeners();
    tracks[0].close();
    tracks[1].close();
    setStart(false);
    setInCall(false);
  };

  return (
    <div className="controls">
      <p
        className={!screenShareEnabled ? "on" : ""}
        onClick={() => toggleScreenShare()}
      >
        {screenShareEnabled ? "StopScreenShare" : "StartScreenShare"}
      </p>
      <p className={trackState.audio ? "on" : ""} onClick={() => mute("audio")}>
        {trackState.audio ? "MuteAudio" : "UnmuteAudio"}
      </p>
      <p className={trackState.video ? "on" : ""} onClick={() => mute("video")}>
        {trackState.video ? "MuteVideo" : "UnmuteVideo"}
      </p>
      {<p onClick={() => leaveChannel()}>Leave</p>}
    </div>
  );
};


const generateRandomString = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
};

const ChannelForm = (props) => {
  const { setInCall } = props;
  const [channelName, setChannelName] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const generatedChannelName = generateRandomString(6);
    const generatedUserName = generateRandomString(6);

    setChannelName(generatedChannelName);
    setUserName(generatedUserName);
  }, []);

  const generateJoinLink = () => {
    const url = new URL('http://localhost:3000/join');
    url.searchParams.append('channelName', channelName);
    url.searchParams.append('userName', userName);
    return url.toString();
  };

  const handleJoinClick = (e) => {
    e.preventDefault();
    setInCall(true);
  };

  const handleJoinWithLinkClick = (e) => {
    e.preventDefault();
    const joinLink = generateJoinLink();
    window.open(joinLink, '_blank');
  };

  return (
    <form className="join">
      <label>
        Channel Name:
        <input
          type="text"
          value={channelName}
          placeholder="Enter Channel Name"
          onChange={(e) => setChannelName(e.target.value)}
        />
      </label>
      <label>
        Username:
        <input
          type="text"
          value={userName}
          placeholder="Enter Username"
          onChange={(e) => setUserName(e.target.value)}
        />
      </label>
      <button onClick={handleJoinClick}>Join</button>
      <button onClick={handleJoinWithLinkClick}>Join with Link</button>
    </form>
  );
}
// App component
function App() {
  const [inCall, setInCall] = useState(false);
  const [channelName, setChannelName] = useState(generateRandomString());
  const [userName, setUserName] = useState(generateRandomString ());
  return (
    <div>
      <h1 className="heading">Start Selling</h1>
      {inCall ? (
        <VideoCall
          setInCall={setInCall}
          channelName={channelName}
          userName={userName}
        />
      ) : (
        <ChannelForm
          setInCall={setInCall}
          setChannelName={setChannelName}
          setUserName={setUserName}
        />
      )}
    </div>
  );
}

export default App;

