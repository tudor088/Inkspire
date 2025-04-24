package com.inkspire.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.inkspire.model.*;
import com.inkspire.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class WebSocketDrawingController {

    private final SimpMessagingTemplate messaging;
    private final DrawingElementRepository drawingRepo;
    private final WhiteboardSessionRepository sessionRepo;
    private final UserRepository userRepo;

    @Autowired
    public WebSocketDrawingController(
            SimpMessagingTemplate messaging,
            DrawingElementRepository drawingRepo,
            WhiteboardSessionRepository sessionRepo,
            UserRepository userRepo
    ) {
        this.messaging = messaging;
        this.drawingRepo = drawingRepo;
        this.sessionRepo = sessionRepo;
        this.userRepo = userRepo;
    }

    @MessageMapping("/draw")
    public void handleDraw(DrawingMessage msg) {
        String sessionCode = msg.getSessionCode();
        Long userId = msg.getUserId();

        WhiteboardSession session = sessionRepo.findBySessionCode(sessionCode)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        switch (msg.getAction()) {
            case "draw" -> {
                DrawingElement drawing = new DrawingElement();

                // Extract the stroke ID from the JSON
                String json = msg.getDataJson();
                ObjectMapper mapper = new ObjectMapper();
                try {
                    JsonNode node = mapper.readTree(json);
                    drawing.setId(node.get("id").asText());
                } catch (Exception e) {
                    throw new RuntimeException("Failed to parse stroke ID from JSON", e);
                }

                drawing.setSession(session);
                drawing.setAuthor(user);
                drawing.setType(msg.getType());
                drawing.setDataJson(json);
                drawing.setOrderIndex((int) drawingRepo.count() + 1);

                drawingRepo.save(drawing);
            }

            case "undo" -> {
                if (msg.getStrokeId() != null) {
                    drawingRepo.findById(msg.getStrokeId()).ifPresent(drawingRepo::delete);
                }
            }

            case "clear" -> {
                drawingRepo.deleteAll(drawingRepo.findBySessionOrderByOrderIndexAsc(session));
            }
        }

        // Broadcast to everyone
        messaging.convertAndSend("/topic/session." + sessionCode, msg);
    }

    // User joining a session
    @MessageMapping("/join")
    public void handleUserJoin(UserJoinMessage msg) {
        // THIS MUST NOT be null:
        String sessionCode = msg.getSessionCode();

        WhiteboardSession session = sessionRepo
                .findBySessionCode(sessionCode)
                .orElseThrow(() -> new RuntimeException("Session not found"));

        User user = userRepo.findById(msg.getUserId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        session.getParticipants().add(user);
        sessionRepo.save(session);

        // Broadcast *to the correct topic*:
        messaging.convertAndSend(
                "/topic/session." + sessionCode,
                new UserJoinMessage(user.getId(), user.getUsername(), "joined")
        );
    }


    // User leaving a session
    @MessageMapping("/leave")
    public void handleUserLeave(UserJoinMessage msg) {
        String sessionCode = msg.getSessionCode();
        Long userId = msg.getUserId();

        WhiteboardSession session = sessionRepo.findBySessionCode(sessionCode)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Remove user from session
        session.getParticipants().remove(user);
        sessionRepo.save(session);

        // Send updated participant list to everyone
        messaging.convertAndSend("/topic/session." + sessionCode, new UserJoinMessage(userId, user.getUsername(), "left"));
    }
}
