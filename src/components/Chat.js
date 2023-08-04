import { useState } from "react";

const Chat = ({ chatMessages, sendRTMMessage, setChatMessages, userName }) => {
  const [inputMessage, setInputMessage] = useState("");

  const handleInputChange = (event) => {
    setInputMessage(event.target.value);
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    console.info("Sending message: ", inputMessage);
    if (inputMessage.trim() !== "") {
      const isSent = await sendRTMMessage(inputMessage); // Send the message using the sendRTMMessage function from the VideoCall component
      if (isSent) {
        setChatMessages([
          ...chatMessages,
          { text: inputMessage, name: userName },
        ]);
        setInputMessage("");
      }
    }
  };

  return (
    <div className="chat-container">
      <div>
        <h2>Chat</h2>
      </div>
      <div className="chat-messages">
        {chatMessages.map(({ text, name }, index) => (
          <div
            key={index}
            className="chat-message"
            style={{
              marginTop: "10px",
              marginBottom: "10px",
            }}
          >
            {name}: {text}
          </div>
        ))}
      </div>
      <form onSubmit={handleSendMessage}>
        <input
          type="text"
          value={inputMessage}
          onChange={handleInputChange}
          placeholder="Type your message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default Chat;
