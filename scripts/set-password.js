#!/usr/bin/env node
'use strict';

/**
 * set-password.js — 交互式修改 TmuxPlant 登录账号和密码
 * 用法: node scripts/set-password.js
 */

const readline = require('readline');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', 'data', 'auth.json');

function prompt(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function promptPassword(question) {
    return new Promise(resolve => {
        process.stdout.write(question);
        const stdin = process.stdin;
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let password = '';
        stdin.on('data', function handler(ch) {
            if (ch === '\r' || ch === '\n') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', handler);
                process.stdout.write('\n');
                resolve(password);
            } else if (ch === '\u0003') {
                // Ctrl+C
                process.stdout.write('\n');
                process.exit(0);
            } else if (ch === '\u007f' || ch === '\b') {
                // Backspace
                if (password.length > 0) {
                    password = password.slice(0, -1);
                    process.stdout.write('\b \b');
                }
            } else {
                password += ch;
                process.stdout.write('*');
            }
        });
    });
}

async function main() {
    console.log('\n🌿 TmuxPlant — 账号密码设置工具\n');

    // Load existing config
    let config = {};
    if (fs.existsSync(AUTH_FILE)) {
        try {
            config = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
        } catch {
            console.error('❌ 无法读取 data/auth.json，将使用空配置');
        }
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const currentUser = config.username || 'admin';
    const usernameInput = await prompt(rl, `用户名 [当前: ${currentUser}，回车保留]: `);
    const newUsername = usernameInput.trim() || currentUser;

    rl.close();

    // Password input with masking
    const password1 = await promptPassword('新密码 (输入时不显示): ');
    if (!password1) {
        console.error('❌ 密码不能为空');
        process.exit(1);
    }
    if (password1.length < 6) {
        console.error('❌ 密码长度至少 6 位');
        process.exit(1);
    }

    const password2 = await promptPassword('确认密码 (输入时不显示): ');
    if (password1 !== password2) {
        console.error('❌ 两次密码不一致，操作取消');
        process.exit(1);
    }

    console.log('\n🔐 正在生成密码哈希 (bcrypt cost=12)，请稍候…');
    const passwordHash = bcrypt.hashSync(password1, 12);

    // Keep existing sessionSecret or generate a new one
    const sessionSecret = config.sessionSecret || crypto.randomBytes(32).toString('hex');

    const newConfig = {
        _comment: "使用 'node scripts/set-password.js' 命令修改用户名和密码",
        username: newUsername,
        passwordHash,
        sessionSecret
    };

    fs.writeFileSync(AUTH_FILE, JSON.stringify(newConfig, null, 2) + '\n', 'utf8');

    console.log(`✅ 账号已更新:
   用户名: ${newUsername}
   密码: 已加密保存到 data/auth.json
   
请重启 TmuxPlant 使更改生效。\n`);
}

main().catch(err => {
    console.error('错误:', err.message);
    process.exit(1);
});
