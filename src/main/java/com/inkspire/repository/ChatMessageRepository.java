package com.inkspire.repository;

import com.inkspire.model.ChatMessage;
import com.inkspire.model.WhiteboardSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    List<ChatMessage> findBySessionOrderByTimestampAsc(WhiteboardSession session);
}
