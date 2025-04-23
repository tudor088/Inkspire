package com.inkspire.repository;

import com.inkspire.model.WhiteboardSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WhiteboardSessionRepository extends JpaRepository<WhiteboardSession, Long> {
    Optional<WhiteboardSession> findBySessionCode(String code);
}
