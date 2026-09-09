
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
        INSERT INTO messages (sender, receiver, content, created_at)
        VALUES (%s, %s, %s, NOW())
    """

    cursor.execute(query, (sender, receiver, content))
    conn.commit()

    message_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return message_id


def get_messages(user1, user2):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT id, sender, receiver, content, created_at
        FROM messages
        WHERE (sender = %s AND receiver = %s)
           OR (sender = %s AND receiver = %s)
        ORDER BY created_at ASC, id ASC
    """

    cursor.execute(query, (user1, user2, user2, user1))
    messages = cursor.fetchall()

    cursor.close()
    conn.close()

    return messages


def create_user(username, email, password_hash):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        INSERT INTO users (username, email, password_hash)
        VALUES (%s, %s, %s)
    """

    cursor.execute(query, (username, email, password_hash))
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

