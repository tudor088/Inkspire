package com.inkspire.repository;

import com.inkspire.model.DrawingElement;
import com.inkspire.model.User;
import com.inkspire.model.WhiteboardSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DrawingElementRepository extends JpaRepository<DrawingElement, String> {
    List<DrawingElement> findBySessionOrderByOrderIndexAsc(WhiteboardSession session);

    List<DrawingElement> findBySessionAndAuthorOrderByOrderIndexAsc(WhiteboardSession session, User author);
}
