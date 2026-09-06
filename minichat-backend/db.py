import os

import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("MYSQLHOST"),
        port=int(os.getenv("MYSQLPORT", "3306")),
        user=os.getenv("MYSQLUSER"),
        password=os.getenv("MYSQLPASSWORD"),
        database=os.getenv("MYSQLDATABASE")
    )


def save_message(sender, receiver, content):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        INSERT INTO messages (sender, receiver, content)
        VALUES (%s, %s, %s)
    """

    cursor.execute(query, (sender, receiver, content))
    conn.commit()

    cursor.close()
    conn.close()


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