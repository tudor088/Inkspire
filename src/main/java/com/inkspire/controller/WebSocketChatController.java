package com.inkspire.controller;

import com.inkspire.dto.ChatMessageDTO;
import com.inkspire.model.ChatMessage;
import com.inkspire.model.User;
import com.inkspire.model.WhiteboardSession;
import com.inkspire.repository.ChatMessageRepository;
import com.inkspire.repository.UserRepository;
import com.inkspire.repository.WhiteboardSessionRepository;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.time.format.DateTimeFormatter;

@Controller
public class WebSocketChatController {

    private final SimpMessagingTemplate messaging;
    private final ChatMessageRepository chatRepo;
    private final WhiteboardSessionRepository sessionRepo;
    private final UserRepository userRepo;

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public WebSocketChatController(
            SimpMessagingTemplate messaging,
            ChatMessageRepository chatRepo,
            WhiteboardSessionRepository sessionRepo,
            UserRepository userRepo
    ) {
        this.messaging  = messaging;
        this.chatRepo   = chatRepo;
        this.sessionRepo = sessionRepo;
        this.userRepo    = userRepo;
    }

    @MessageMapping("/chat")         //  ⬅️ “/app/chat”
    public void handleChat(ChatMessageDTO incoming) {

        WhiteboardSession session = sessionRepo.findBySessionCode(incoming.getSessionCode())
                .orElseThrow(() -> new RuntimeException("Session not found"));

        User author = userRepo.findById(incoming.getUserId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        // 1. Persist
        ChatMessage saved = new ChatMessage();
        saved.setAuthor(author);
        saved.setSession(session);
        saved.setContent(incoming.getContent());
        chatRepo.save(saved);

        // 2. Broadcast to everyone in the same session
        ChatMessageDTO outgoing = new ChatMessageDTO(
                incoming.getSessionCode(),
                author.getId(),
                author.getUsername(),
                incoming.getContent(),
                saved.getTimestamp().format(ISO)
        );
        messaging.convertAndSend("/topic/session." + incoming.getSessionCode() + ".chat", outgoing);
    }
}
