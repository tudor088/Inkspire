package com.inkspire.controller;

import com.inkspire.dto.CreateSessionRequest;
import com.inkspire.dto.SessionDTO;
import com.inkspire.model.User;
import com.inkspire.model.WhiteboardSession;
import com.inkspire.model.UserJoinMessage;
import com.inkspire.repository.DrawingElementRepository;
import com.inkspire.repository.UserRepository;
import com.inkspire.repository.WhiteboardSessionRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final WhiteboardSessionRepository sessionRepo;
    private final UserRepository userRepo;
    private final SimpMessagingTemplate messaging;
    private final DrawingElementRepository drawingRepo;

    public SessionController(
            WhiteboardSessionRepository sessionRepo,
            UserRepository userRepo,
            SimpMessagingTemplate messaging,
            DrawingElementRepository drawingRepo
    ) {
        this.sessionRepo = sessionRepo;
        this.userRepo    = userRepo;
        this.messaging   = messaging;
        this.drawingRepo = drawingRepo;
    }

    @PostMapping("/create/{userId}")
    public WhiteboardSession createSession(
            @PathVariable Long userId,
            @RequestBody CreateSessionRequest request
    ) {
        User creator = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        WhiteboardSession session = new WhiteboardSession();
        session.setSessionCode(UUID.randomUUID().toString().substring(0, 8));
        session.setName(request.getName());
        session.setPassword(request.getPassword() != null && !request.getPassword().isBlank()
                ? request.getPassword() : null);
        session.setCreator(creator);
        session.getParticipants().add(creator);

        WhiteboardSession saved = sessionRepo.save(session);

        // notify dashboard clients to refresh their session list
        messaging.convertAndSend("/topic/sessions", "refresh");

        return saved;
    }

    @PostMapping("/join/{userId}/{code}")
    public WhiteboardSession joinSession(
            @PathVariable Long userId,
            @PathVariable String code
    ) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        session.getParticipants().add(user);
        sessionRepo.save(session);

        // notify participants of this session
        messaging.convertAndSend(
                "/topic/session." + code,
                new UserJoinMessage(userId, user.getUsername(), "joined")
        );
        // notify dashboard to refresh all sessions list
        messaging.convertAndSend("/topic/sessions", "refresh");

        return session;
    }

    @PostMapping("/join-protected")
    public WhiteboardSession joinProtectedSession(
            @RequestParam Long userId,
            @RequestParam String code,
            @RequestParam String password
    ) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        if (!session.isPasswordProtected() || !session.getPassword().equals(password)) {
            throw new RuntimeException("Incorrect password");
        }

        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        session.getParticipants().add(user);
        WhiteboardSession saved = sessionRepo.save(session);

        // per‐session notification
        messaging.convertAndSend(
                "/topic/session." + code,
                new UserJoinMessage(userId, user.getUsername(), "joined")
        );
        // dashboard refresh
        messaging.convertAndSend("/topic/sessions", "refresh");

        return saved;
    }

    @GetMapping("/all")
    public List<SessionDTO> getAllSessions() {
        return sessionRepo.findAll().stream()
                .map(session -> new SessionDTO(
                        session.getSessionCode(),
                        session.getName(),
                        session.getCreator() != null
                                ? session.getCreator().getUsername()
                                : "Unknown",
                        session.isPasswordProtected(),
                        session.getCreatedAt(),
                        session.getParticipants().size()
                ))
                .toList();
    }

    @DeleteMapping("/leave/{userId}/{code}")
    public void leaveSession(
            @PathVariable Long userId,
            @PathVariable String code
    ) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        session.getParticipants().remove(user);
        sessionRepo.save(session);

        // per‐session notification
        messaging.convertAndSend(
                "/topic/session." + code,
                new UserJoinMessage(userId, user.getUsername(), "left")
        );
        // dashboard refresh
        messaging.convertAndSend("/topic/sessions", "refresh");
    }

    @GetMapping("/code/{code}")
    public WhiteboardSession getSessionByCode(@PathVariable String code) {
        return sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
    }

    @PostMapping("/kick/{creatorId}/{targetUserId}/{code}")
    public void kickUser(
            @PathVariable Long creatorId,
            @PathVariable Long targetUserId,
            @PathVariable String code
    ) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        if (!session.getCreator().getId().equals(creatorId) && creatorId != 8) {
            throw new RuntimeException("Only the creator can kick users");
        }

        User target = userRepo.findById(targetUserId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        session.getParticipants().remove(target);
        sessionRepo.save(session);

        // per‐session notification
        messaging.convertAndSend(
                "/topic/session." + code,
                new UserJoinMessage(targetUserId, target.getUsername(), "left")
        );
        // dashboard refresh
        messaging.convertAndSend("/topic/sessions", "refresh");
    }

    @DeleteMapping("/delete/{creatorId}/{code}")
    public void deleteSession(
            @PathVariable Long creatorId,
            @PathVariable String code
    ) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        if (!session.getCreator().getId().equals(creatorId) && creatorId != 8) {
            throw new RuntimeException("Only the creator can delete this session");
        }

        // first delete associated drawings
        drawingRepo.deleteAll(
                drawingRepo.findBySessionOrderByOrderIndexAsc(session)
        );
        // then delete the session itself
        sessionRepo.delete(session);

        // dashboard refresh
        messaging.convertAndSend("/topic/sessions", "refresh");
    }
}
