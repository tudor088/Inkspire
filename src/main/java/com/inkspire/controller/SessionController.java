package com.inkspire.controller;

import com.inkspire.dto.CreateSessionRequest;
import com.inkspire.dto.SessionDTO;
import com.inkspire.model.User;
import com.inkspire.model.WhiteboardSession;
import com.inkspire.repository.DrawingElementRepository;
import com.inkspire.repository.UserRepository;
import com.inkspire.model.UserJoinMessage;
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
    public WhiteboardSession createSession(@PathVariable Long userId, @RequestBody CreateSessionRequest request) {
        Optional<User> userOpt = userRepo.findById(userId);
        if (userOpt.isEmpty()) throw new RuntimeException("User not found");

        WhiteboardSession session = new WhiteboardSession();
        session.setSessionCode(UUID.randomUUID().toString().substring(0, 8)); // short random code
        session.setName(request.getName());
        session.setPassword(request.getPassword() != null && !request.getPassword().isBlank() ? request.getPassword() : null);
        session.setCreator(userOpt.get());
        session.getParticipants().add(userOpt.get());

        return sessionRepo.save(session);
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

        // ——— NEW: broadcast over WebSocket to everyone listening ———
        messaging.convertAndSend(
                "/topic/session." + code,
                new UserJoinMessage(userId, user.getUsername(), "joined")
        );

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

        // broadcast over WebSocket just like the open join
        messaging.convertAndSend(
                "/topic/session." + code,
                new UserJoinMessage(userId, user.getUsername(), "joined")
        );

        return saved;
    }



    @GetMapping("/all")
    public List<SessionDTO> getAllSessions() {
        return sessionRepo.findAll().stream().map(session -> new SessionDTO(
                session.getSessionCode(),
                session.getName(),
                session.getCreator() != null ? session.getCreator().getUsername() : "Unknown",
                session.isPasswordProtected(),
                session.getCreatedAt(),
                session.getParticipants().size()
        )).toList();
    }


    @DeleteMapping("/leave/{userId}/{code}")
    public void leaveSession(@PathVariable Long userId, @PathVariable String code) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        session.getParticipants().remove(user);
        sessionRepo.save(session);

        // ——— NEW: broadcast leave event too ———
        messaging.convertAndSend(
                "/topic/session." + code,
                new UserJoinMessage(userId, user.getUsername(), "left")
        );
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

        // 1) only the creator may kick
        if (!session.getCreator().getId().equals(creatorId)) {
            throw new RuntimeException("Only the creator can kick users");
        }

        User target = userRepo.findById(targetUserId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        session.getParticipants().remove(target);
        sessionRepo.save(session);

        // 2) broadcast a “left” event so everyone updates their list (and the kicked user knows they’re out)
        messaging.convertAndSend(
                "/topic/session." + code,
                new UserJoinMessage(targetUserId, target.getUsername(), "left")
        );
    }

    @DeleteMapping("/delete/{creatorId}/{code}")
    public void deleteSession(
            @PathVariable Long creatorId,
            @PathVariable String code
    ) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        if (!session.getCreator().getId().equals(creatorId)) {
            throw new RuntimeException("Only the creator can delete this session");
        }

        // remove any drawings first
        drawingRepo.deleteAll(
                drawingRepo.findBySessionOrderByOrderIndexAsc(session)
        );
        // then delete the session itself
        sessionRepo.delete(session);
    }
}
