package com.inkspire.controller;

import com.inkspire.model.User;
import com.inkspire.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepo;

    public UserController(UserRepository userRepo) {
        this.userRepo = userRepo;
        System.out.println("✅ UserController loaded");
    }

    @PostMapping
    public User create(@RequestBody User user) {
        return userRepo.save(user);
    }

    @GetMapping
    public List<User> all() {
        return userRepo.findAll();
    }
}
