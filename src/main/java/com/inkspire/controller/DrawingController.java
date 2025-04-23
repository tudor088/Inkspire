package com.inkspire.controller;

import com.inkspire.model.DrawingElement;
import com.inkspire.model.User;
import com.inkspire.model.WhiteboardSession;
import com.inkspire.repository.DrawingElementRepository;
import com.inkspire.repository.UserRepository;
import com.inkspire.repository.WhiteboardSessionRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/drawings")
public class DrawingController {

    private final DrawingElementRepository drawingRepo;
    private final UserRepository userRepo;
    private final WhiteboardSessionRepository sessionRepo;

    public DrawingController(DrawingElementRepository drawingRepo,
                             UserRepository userRepo,
                             WhiteboardSessionRepository sessionRepo) {
        this.drawingRepo = drawingRepo;
        this.userRepo = userRepo;
        this.sessionRepo = sessionRepo;
    }

    @PostMapping("/create/{userId}/{sessionId}")
    public DrawingElement addElement(@PathVariable Long userId,
                                     @PathVariable Long sessionId,
                                     @RequestBody DrawingElement data) {
        User user = userRepo.findById(userId).orElseThrow();
        WhiteboardSession session = sessionRepo.findById(sessionId).orElseThrow();

        data.setAuthor(user);
        data.setSession(session);
        data.setOrderIndex((int) drawingRepo.count() + 1);

        return drawingRepo.save(data);
    }

    @GetMapping("/session/{sessionId}")
    public List<DrawingElement> getAll(@PathVariable Long sessionId) {
        WhiteboardSession session = sessionRepo.findById(sessionId).orElseThrow();
        return drawingRepo.findBySessionOrderByOrderIndexAsc(session);
    }

    @GetMapping("/code/{code}")
    public List<DrawingElement> getBySessionCode(@PathVariable String code) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));

        return drawingRepo.findBySessionOrderByOrderIndexAsc(session);
    }

    @DeleteMapping("/code/{code}")
    public void clearSessionDrawings(@PathVariable String code) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));

        List<DrawingElement> drawings = drawingRepo.findBySessionOrderByOrderIndexAsc(session);
        drawingRepo.deleteAll(drawings);
    }

    @GetMapping("/code/{code}/user/{userId}")
    public List<DrawingElement> getBySessionAndUser(@PathVariable String code, @PathVariable Long userId) {
        WhiteboardSession session = sessionRepo.findBySessionCode(code)
                .orElseThrow(() -> new RuntimeException("Session not found"));

        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        return drawingRepo.findBySessionAndAuthorOrderByOrderIndexAsc(session, user);
    }

    @DeleteMapping("/stroke/{id}")
    public void deleteStrokeById(@PathVariable String id) {
        drawingRepo.deleteById(id);
    }

}
