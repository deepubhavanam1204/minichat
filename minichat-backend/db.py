import os

import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

load_dotenv()


connection_pool = pooling.MySQLConnectionPool(
    pool_name="minichat_pool",
    pool_size=5,
    pool_reset_session=True,
    host=os.getenv("MYSQLHOST"),
    port=int(os.getenv("MYSQLPORT", "3306")),
    user=os.getenv("MYSQLUSER"),
    password=os.getenv("MYSQLPASSWORD"),
    database=os.getenv("MYSQLDATABASE")
)


def get_connection():
    return connection_pool.get_connection()


def save_message(sender, receiver, content):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        INSERT INTO messages (sender, receiver, content, created_at, status)
        VALUES (%s, %s, %s, NOW(), %s)
    """

    cursor.execute(
        query,
        (sender, receiver, content, "SENT")
    )

    conn.commit()

    message_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return message_id


def get_messages(user1, user2):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT id, sender, receiver, content, status, created_at
        FROM messages
        WHERE (sender = %s AND receiver = %s)
           OR (sender = %s AND receiver = %s)
        ORDER BY created_at ASC, id ASC
    """

    cursor.execute(
        query,
        (user1, user2, user2, user1)
    )

    messages = cursor.fetchall()

    cursor.close()
    conn.close()

    return messages


def update_message_status(message_id, status, receiver):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        UPDATE messages
        SET status = %s
        WHERE id = %s
          AND receiver = %s
    """

    cursor.execute(
        query,
        (status, message_id, receiver)
    )

    conn.commit()

    updated = cursor.rowcount

    cursor.close()
    conn.close()

    return updated


def mark_message_as_read(message_id, receiver):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        UPDATE messages
        SET status = 'READ'
        WHERE id = %s
          AND receiver = %s
          AND status = 'DELIVERED'
    """

    cursor.execute(
        query,
        (message_id, receiver)
    )

    conn.commit()

    updated = cursor.rowcount

    cursor.close()
    conn.close()

    return updated


def get_message_sender(message_id, receiver):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT sender
        FROM messages
        WHERE id = %s
          AND receiver = %s
    """

    cursor.execute(
        query,
        (message_id, receiver)
    )

    message = cursor.fetchone()

    cursor.close()
    conn.close()

    if not message:
        return None

    return message["sender"]


def create_user(username, email, password_hash):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        INSERT INTO users (username, email, password_hash)
        VALUES (%s, %s, %s)
    """

    cursor.execute(
        query,
        (username, email, password_hash)
    )

    conn.commit()

    user_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return user_id


def find_user_by_email(email):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT id, username, email, password_hash
        FROM users
        WHERE email = %s
    """

    cursor.execute(query, (email,))

    user = cursor.fetchone()

    cursor.close()
    conn.close()

    return user


def find_user_by_username(username):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT id, username, email
        FROM users
        WHERE username = %s
    """

    cursor.execute(query, (username,))

    user = cursor.fetchone()

    cursor.close()
    conn.close()

    return user


def get_all_users():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT id, username, email
        FROM users
        ORDER BY username ASC
    """

    cursor.execute(query)

    users = cursor.fetchall()

    cursor.close()
    conn.close()

    return users