package com.inkspire.controller;

import com.inkspire.model.User;
import com.inkspire.model.WhiteboardSession;
import com.inkspire.repository.UserRepository;
import com.inkspire.repository.WhiteboardSessionRepository;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final WhiteboardSessionRepository sessionRepo;
    private final UserRepository userRepo;

    public SessionController(WhiteboardSessionRepository sessionRepo, UserRepository userRepo) {
        this.sessionRepo = sessionRepo;
        this.userRepo = userRepo;
    }

    @PostMapping("/create/{userId}")
    public WhiteboardSession createSession(@PathVariable Long userId) {
        Optional<User> userOpt = userRepo.findById(userId);
        if (userOpt.isEmpty()) throw new RuntimeException("User not found");

        WhiteboardSession session = new WhiteboardSession();
        session.setSessionCode(UUID.randomUUID().toString().substring(0, 8)); // short random code
        session.getParticipants().add(userOpt.get());

        return sessionRepo.save(session);
    }

    @PostMapping("/join/{userId}/{code}")
    public WhiteboardSession joinSession(@PathVariable Long userId, @PathVariable String code) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        session.getParticipants().add(user);
        return sessionRepo.save(session);
    }
}
