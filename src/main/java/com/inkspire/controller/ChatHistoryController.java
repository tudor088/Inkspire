package com.inkspire.controller;

import com.inkspire.dto.ChatMessageDTO;
import com.inkspire.model.ChatMessage;
import com.inkspire.model.WhiteboardSession;
import com.inkspire.repository.ChatMessageRepository;
import com.inkspire.repository.WhiteboardSessionRepository;
import org.springframework.web.bind.annotation.*;

import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/api/chat")
public class ChatHistoryController {

    private final ChatMessageRepository chatRepo;
    private final WhiteboardSessionRepository sessionRepo;
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public ChatHistoryController(ChatMessageRepository chatRepo,
                                 WhiteboardSessionRepository sessionRepo) {
        this.chatRepo = chatRepo;
        this.sessionRepo = sessionRepo;
    }

    @GetMapping("/session/{code}")
    public List<ChatMessageDTO> history(@PathVariable String code) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));

        return chatRepo.findBySessionOrderByTimestampAsc(session)
                .stream()
                .map(m -> new ChatMessageDTO(
                        code,
                        m.getAuthor().getId(),
                        m.getAuthor().getUsername(),
                        m.getContent(),
                        m.getTimestamp().format(ISO)))
                .toList();
    }
}
